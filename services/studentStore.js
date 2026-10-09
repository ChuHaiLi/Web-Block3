'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { FIELDS, validateStudent, validateNewStudent, isValidStudentId } = require('../validators/studentValidator');
const { CATALOG } = require('./studentCatalog');

class StorageError extends Error {
  constructor(message, cause) {
    super(message, { cause });
    this.name = 'StorageError';
  }
}

class StudentConflictError extends Error {
  constructor(errors) {
    super('Thông tin sinh viên bị trùng.');
    this.name = 'StudentConflictError';
    this.errors = errors;
  }
}

class StudentIdExhaustedError extends Error {
  constructor(prefix) {
    super(`Không thể cấp MSSV mới: khóa ${prefix.slice(1)} đã hết phạm vi 5 chữ số thứ tự. Dữ liệu hiện có được giữ nguyên.`);
    this.name = 'StudentIdExhaustedError';
  }
}

class StudentNotFoundError extends Error {
  constructor() {
    super('Sinh viên không tồn tại hoặc đã được xóa.');
    this.name = 'StudentNotFoundError';
  }
}

// Mã đã biết từng được cấp nhưng đã xóa trước nâng cấp; không cấp lại kể cả kho rỗng.
const KNOWN_RESERVED_IDS = ['02600011'];

function mergeIssuedId(counters, id) {
  if (!/^0[0-9]{7}$/.test(id)) return;
  const prefix = id.slice(0, 3);
  const sequence = id.slice(3);
  if (!Object.hasOwn(counters, prefix) || Number(sequence) > Number(counters[prefix])) {
    counters[prefix] = sequence;
  }
}

function checkRecords(records) {
  if (!Array.isArray(records)) throw new Error('Dữ liệu sinh viên phải là một mảng.');
  const ids = new Set();
  const emails = new Set();
  return records.map((record, index) => {
    if (!record || typeof record !== 'object' || Array.isArray(record) ||
        Object.keys(record).length !== FIELDS.length ||
        !FIELDS.every((field) => Object.hasOwn(record, field))) {
      throw new Error(`Bản ghi ${index + 1} phải có đúng năm trường đã thống nhất.`);
    }
    const result = validateStudent(record);
    if (!result.isValid) throw new Error(`Bản ghi ${index + 1} không hợp lệ.`);
    const student = result.values;
    const emailKey = student.email.toLowerCase();
    if (ids.has(student.id) || emails.has(emailKey)) {
      throw new Error(`Bản ghi ${index + 1} trùng MSSV hoặc email.`);
    }
    ids.add(student.id);
    emails.add(emailKey);
    // Validation không được đổi MSSV hoặc thông tin của bản ghi đã tồn tại.
    return { ...record };
  });
}

function createStudentStore({
  filePath = path.join(__dirname, '../data/students.json'),
  seedPath = path.join(__dirname, '../data/students.seed.json'),
  statePath = path.join(path.dirname(filePath), `${path.basename(filePath, '.json')}.id-state.json`),
  fileSystem = fs,
} = {}) {
  let writeQueue = Promise.resolve();
  let initialized = false;
  const markerPath = `${statePath}.initialized`;

  function serialize(task) {
    const operation = writeQueue.then(task);
    writeQueue = operation.catch(() => {});
    return operation;
  }

  async function readRecords(target) {
    const content = await fileSystem.readFile(target, 'utf8');
    return checkRecords(JSON.parse(content));
  }

  async function writeAtomically(target, content) {
    const temporaryPath = `${target}.${randomUUID()}.tmp`;
    try {
      await fileSystem.writeFile(temporaryPath, JSON.stringify(content, null, 2) + '\n', {
        encoding: 'utf8', flag: 'wx', flush: true,
      });
      // File tạm cùng thư mục; không xóa file chính trước khi rename.
      await fileSystem.rename(temporaryPath, target);
    } catch (error) {
      await fileSystem.unlink(temporaryPath).catch(() => {});
      throw error;
    }
  }

  async function optionalFile(target) {
    try { return await fileSystem.readFile(target, 'utf8'); }
    catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  }

  async function readAllocationState({ allowLegacy = false } = {}) {
    const marker = JSON.parse(await fileSystem.readFile(markerPath, 'utf8'));
    const state = JSON.parse(await fileSystem.readFile(statePath, 'utf8'));
    if (!marker || ![1, 2].includes(marker.version) || Object.keys(marker).length !== 1 ||
        (!allowLegacy && marker.version !== 2) || !state || Array.isArray(state)) {
      throw new Error('Trạng thái cấp MSSV không hợp lệ; không được tự reset.');
    }
    if (allowLegacy && marker.version === 1 && state.version === 1 && Object.keys(state).length === 2 &&
        typeof state.highWaterMark === 'string' && /^[0-9]{8,20}$/.test(state.highWaterMark)) {
      return { version: 2, legacyHighWaterMark: state.highWaterMark, counters: {} };
    }
    if (state.version !== 2 || Object.keys(state).length !== 3 ||
        typeof state.legacyHighWaterMark !== 'string' || !/^[0-9]{8,20}$/.test(state.legacyHighWaterMark) ||
        !state.counters || typeof state.counters !== 'object' || Array.isArray(state.counters) ||
        Object.keys(state.counters).length === 0 ||
        Object.entries(state.counters).some(([prefix, sequence]) =>
          !/^0[0-9]{2}$/.test(prefix) || typeof sequence !== 'string' || !/^[0-9]{5}$/.test(sequence))) {
      throw new Error('Trạng thái cấp MSSV theo khóa không hợp lệ; không được tự reset.');
    }
    return state;
  }

  function reconcileCounters(state, students) {
    const counters = { ...state.counters };
    for (const item of CATALOG.classes) {
      const prefix = '0' + item.cohort;
      if (!Object.hasOwn(counters, prefix)) counters[prefix] = '00000';
    }
    // Giữ max của state cũ, dữ liệu còn lại và mã đã biết bị xóa; không giảm.
    mergeIssuedId(counters, state.legacyHighWaterMark);
    for (const student of students) mergeIssuedId(counters, student.id.trim());
    for (const id of KNOWN_RESERVED_IDS) mergeIssuedId(counters, id);
    return { ...state, counters };
  }

  async function ensureCounters(students) {
    const previous = await readAllocationState();
    const current = reconcileCounters(previous, students);
    if (JSON.stringify(previous) !== JSON.stringify(current)) {
      await writeAtomically(statePath, current);
    }
    return current;
  }

  function initialize() {
    return serialize(async () => {
      try {
        await fileSystem.mkdir(path.dirname(filePath), { recursive: true });
        const marker = await optionalFile(markerPath);
        const state = await optionalFile(statePath);
        const studentsContent = await optionalFile(filePath);
        if (studentsContent === null && (marker !== null || state !== null || initialized)) {
          throw new Error('Kho đã khởi tạo nhưng file sinh viên bị mất; không được seed lại.');
        }
        if (studentsContent !== null && marker === null && state === null) {
          // Không thể phân biệt dữ liệu nhập cũ với kho mất cả metadata.
          // Ưu tiên giữ lịch sử: không tự bootstrap lại trên hồ sơ đang tồn tại.
          throw new Error('File sinh viên có sẵn nhưng thiếu cả state/marker; cần phục hồi lịch sử đáng tin cậy, không tự reset.');
        }
        let students;
        if (studentsContent === null) {
          students = await readRecords(seedPath);
          if (students.length !== 40) throw new Error('Seed phải có đúng 40 sinh viên.');
          await writeAtomically(filePath, students);
        } else {
          students = checkRecords(JSON.parse(studentsContent));
        }
        if (marker === null && state === null && !initialized) {
          // Dấu mốc được ghi trước. Nếu bootstrap bị ngắt, lần sau phải dừng an toàn,
          // không tự tạo lại bộ đếm từ danh sách có thể đã mất mã do xóa.
          await fileSystem.writeFile(markerPath, JSON.stringify({ version: 1 }) + '\n', {
            encoding: 'utf8', flag: 'wx', flush: true,
          });
          await writeAtomically(statePath, reconcileCounters({ version: 2, legacyHighWaterMark: '00000000', counters: {} }, students));
          await writeAtomically(markerPath, { version: 2 });
        } else {
          const previous = await readAllocationState({ allowLegacy: true });
          const current = reconcileCounters(previous, students);
          if (JSON.parse(state).version === 1 || JSON.stringify(previous) !== JSON.stringify(current)) {
            await writeAtomically(statePath, current);
          }
          // State v2 trước, marker v2 sau: crash giữa hai bước có thể hoàn tất an toàn.
          // Marker v2 cấm vô tình nạp lại state v1 và hạ lịch sử các bộ đếm.
          if (JSON.parse(marker).version === 1) await writeAtomically(markerPath, { version: 2 });
        }
        initialized = true;
      } catch (error) {
        throw new StorageError('Không thể khởi tạo kho hoặc trạng thái cấp MSSV. Không tự reset dữ liệu.', error);
      }
    });
  }

  async function getById(id) {
    if (!isValidStudentId(id)) throw new StudentNotFoundError();
    const students = await getAll();
    const student = students.find((item) => item.id.trim().toUpperCase() === id.toUpperCase());
    if (!student) throw new StudentNotFoundError();
    return student;
  }

  async function getAll() {
    try {
      return await readRecords(filePath);
    } catch (error) {
      throw new StorageError('Không thể đọc dữ liệu sinh viên.', error);
    }
  }

  function add(input) {
    return serialize(async () => {
      const validation = validateNewStudent(input);
      if (!validation.isValid) throw new StudentConflictError(validation.errors);
      try {
        if (!initialized) throw new Error('Kho cấp MSSV chưa được khởi tạo.');
        const students = await readRecords(filePath);
        const errors = {};
        if (students.some((item) => item.email.trim().toLowerCase() === validation.values.email.toLowerCase())) {
          errors.email = 'Email này đã được sử dụng. Vui lòng nhập email khác.';
        }
        if (Object.keys(errors).length) throw new StudentConflictError(errors);
        const state = await ensureCounters(students);
        const selectedClass = CATALOG.classes.find((item) => item.code === validation.values.className);
        const prefix = '0' + selectedClass.cohort;
        const maximum = Number(state.counters[prefix]);
        if (maximum >= 99999) throw new StudentIdExhaustedError(prefix);
        const sequence = String(maximum + 1).padStart(5, '0');
        const id = prefix + sequence;
        if (students.some((item) => item.id.trim().toUpperCase() === id)) {
          throw new Error('Ứng viên MSSV bị trùng.');
        }
        // Reserve bền vững TRƯỚC ghi sinh viên. Lỗi/ngắt sau đây chỉ bỏ qua mã,
        // tuyệt đối không rollback bộ đếm để dùng lại mã đã reserve.
        await writeAtomically(statePath, { ...state, counters: { ...state.counters, [prefix]: sequence } });
        const student = { id, ...validation.values };
        await writeAtomically(filePath, [...students, student]);
        return student;
      } catch (error) {
        if (error instanceof StudentConflictError || error instanceof StudentIdExhaustedError) throw error;
        throw new StorageError('Không thể lưu dữ liệu sinh viên.', error);
      }
    });
  }

  function remove(id) {
    return serialize(async () => {
      if (!isValidStudentId(id)) throw new StudentNotFoundError();
      try {
        if (!initialized) throw new Error('Kho cấp MSSV chưa được khởi tạo.');
        const students = await readRecords(filePath);
        const index = students.findIndex((item) => item.id.trim().toUpperCase() === id.toUpperCase());
        if (index < 0) throw new StudentNotFoundError();
        // Kiểm tra trạng thái trước xóa, giữ max vĩnh viễn kể cả xóa hồ sơ cuối.
        await ensureCounters(students);
        const student = students[index];
        await writeAtomically(filePath, [...students.slice(0, index), ...students.slice(index + 1)]);
        return student;
      } catch (error) {
        if (error instanceof StudentNotFoundError) throw error;
        throw new StorageError('Không thể xóa sinh viên. Dữ liệu chưa được xác nhận lưu thành công.', error);
      }
    });
  }

  return { initialize, getAll, getById, add, remove };
}

module.exports = { createStudentStore, StorageError, StudentConflictError, StudentIdExhaustedError, StudentNotFoundError };
