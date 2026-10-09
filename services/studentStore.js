'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { FIELDS, validateStudent, validateNewStudent, isValidStudentId } = require('../validators/studentValidator');

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
  constructor() {
    super('Không thể cấp MSSV mới: đã hết phạm vi 8 chữ số. Dữ liệu hiện có được giữ nguyên.');
    this.name = 'StudentIdExhaustedError';
  }
}

class StudentNotFoundError extends Error {
  constructor() {
    super('Sinh viên không tồn tại hoặc đã được xóa.');
    this.name = 'StudentNotFoundError';
  }
}

function maximumNumericId(students) {
  let maximum = 0n;
  for (const student of students) {
    // Tương thích MSSV cũ như 2222; không sửa, không pad lại mã cũ.
    // Mã có chữ/dấu - không thuộc dãy số tự động.
    const existingId = student.id.trim();
    if (/^[0-9]+$/.test(existingId)) {
      const value = BigInt(existingId);
      if (value > maximum) maximum = value;
    }
  }
  return maximum;
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

  async function readHighWaterMark() {
    const marker = JSON.parse(await fileSystem.readFile(markerPath, 'utf8'));
    const state = JSON.parse(await fileSystem.readFile(statePath, 'utf8'));
    if (!marker || marker.version !== 1 || Object.keys(marker).length !== 1 ||
        !state || state.version !== 1 || Object.keys(state).length !== 2 ||
        typeof state.highWaterMark !== 'string' || !/^[0-9]{8,20}$/.test(state.highWaterMark)) {
      throw new Error('Trạng thái cấp MSSV không hợp lệ; không được tự reset.');
    }
    return BigInt(state.highWaterMark);
  }

  function saveHighWaterMark(value) {
    return writeAtomically(statePath, { version: 1, highWaterMark: String(value).padStart(8, '0') });
  }

  async function ensureHighWaterMark(students) {
    const previous = await readHighWaterMark();
    const current = maximumNumericId(students);
    // Chỉ được tăng: hỗ trợ nhập dữ liệu cũ có mã số lớn hơn, không giảm sau xóa.
    if (current > previous) {
      await saveHighWaterMark(current);
      return current;
    }
    return previous;
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
          await saveHighWaterMark(maximumNumericId(students));
        } else {
          await ensureHighWaterMark(students);
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
        const maximum = await ensureHighWaterMark(students);
        if (maximum >= 99999999n) throw new StudentIdExhaustedError();
        const id = String(maximum + 1n).padStart(8, '0');
        if (students.some((item) => item.id.trim().toUpperCase() === id)) {
          throw new Error('Ứng viên MSSV bị trùng.');
        }
        // Reserve bền vững TRƯỚC ghi sinh viên. Lỗi/ngắt sau đây chỉ bỏ qua mã,
        // tuyệt đối không rollback bộ đếm để dùng lại mã đã reserve.
        await saveHighWaterMark(maximum + 1n);
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
        await ensureHighWaterMark(students);
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
