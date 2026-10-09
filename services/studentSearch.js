'use strict';

const { MAJORS } = require('../validators/studentValidator');
const { CATALOG } = require('./studentCatalog');
const PAGE_SIZE = 20;

class StudentQueryError extends Error {
  constructor(message) {
    super(message);
    this.name = 'StudentQueryError';
  }
}

function normalizeSearch(value) {
  return value.normalize('NFD').replace(/\p{M}/gu, '').replace(/[đĐ]/gu, 'd')
    .toLowerCase().trim().replace(/\s+/gu, ' ');
}

function selectStudents(allStudents, query = {}) {
  const classes = CATALOG.classes.map((item) => item.code)
    .sort((a, b) => a.localeCompare(b, 'vi'));
  const filters = { q: '', className: '', major: '' };
  const limits = { q: 100, className: 30, major: 10 };

  // Express dùng query parser đơn giản; từ chối cả các khóa dạng q[x].
  if (Object.keys(query).some((key) => /^(q|className|major|page)\[/.test(key))) {
    throw new StudentQueryError('Tham số tìm kiếm/lọc phải là văn bản, không phải mảng hoặc đối tượng.');
  }
  for (const field of Object.keys(filters)) {
    const value = query[field];
    if (value === undefined) continue;
    if (typeof value !== 'string' || /[\u0000-\u001f\u007f-\u009f]/u.test(value)) {
      throw new StudentQueryError(`Tham số ${field} phải là một giá trị văn bản hợp lệ.`);
    }
    filters[field] = value.trim().normalize('NFC');
    if ([...filters[field]].length > limits[field]) {
      throw new StudentQueryError(`Tham số ${field} không được dài quá ${limits[field]} ký tự.`);
    }
  }
  if (filters.className && !classes.includes(filters.className)) {
    throw new StudentQueryError('Lớp lọc không tồn tại trong danh mục.');
  }
  if (filters.major && !Object.hasOwn(MAJORS, filters.major)) {
    throw new StudentQueryError('Ngành lọc không hợp lệ.');
  }

  const keyword = normalizeSearch(filters.q);
  const matches = allStudents.filter((student) => {
    const matchesSearch = !keyword || normalizeSearch(student.name).includes(keyword) ||
      normalizeSearch(student.id).includes(keyword);
    return matchesSearch && (!filters.className || student.className === filters.className) &&
      (!filters.major || student.major === filters.major);
  });
  let requestedPage = 1;
  if (query.page !== undefined) {
    if (typeof query.page !== 'string' || !/^[1-9][0-9]*$/.test(query.page) ||
        !Number.isSafeInteger(Number(query.page))) {
      throw new StudentQueryError('Số trang phải là một số nguyên dương hợp lệ.');
    }
    requestedPage = Number(query.page);
  }
  // Lọc toàn bộ trước, chia trang sau; giữ thứ tự lưu trong JSON.
  const resultCount = matches.length;
  const totalPages = Math.max(1, Math.ceil(resultCount / PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);
  const offset = (page - 1) * PAGE_SIZE;
  const students = matches.slice(offset, offset + PAGE_SIZE);
  function pageUrl(number) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
    params.set('page', String(number));
    return `/students?${params}`;
  }
  // Chỉ render một cửa sổ trang nhỏ khi danh sách lớn.
  const pageNumbers = [...new Set([1, totalPages, page - 2, page - 1, page, page + 1, page + 2])]
    .filter((number) => number >= 1 && number <= totalPages).sort((a, b) => a - b);
  const pageLinks = pageNumbers.map((number, index) => ({
    number, url: pageUrl(number), gap: index > 0 && number - pageNumbers[index - 1] > 1,
  }));
  const remainingFilters = new URLSearchParams();
  if (filters.className) remainingFilters.set('className', filters.className);
  if (filters.major) remainingFilters.set('major', filters.major);
  const suffix = remainingFilters.toString();
  return {
    students, totalCount: allStudents.length, resultCount, classes, filters,
    pagination: {
      page, pageSize: PAGE_SIZE, totalPages, start: resultCount ? offset + 1 : 0,
      end: offset + students.length, pageLinks,
      previousUrl: page > 1 ? pageUrl(page - 1) : '',
      nextUrl: page < totalPages ? pageUrl(page + 1) : '',
    },
    hasFilters: Object.values(filters).some(Boolean),
    clearSearchUrl: suffix ? `/students?${suffix}` : '/students',
  };
}

module.exports = { selectStudents, StudentQueryError, PAGE_SIZE };
