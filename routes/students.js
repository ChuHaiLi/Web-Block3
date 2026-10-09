'use strict';

const express = require('express');
const { MAJORS, validateNewStudent, isValidStudentId } = require('../validators/studentValidator');
const { StudentConflictError, StudentIdExhaustedError, StudentNotFoundError } = require('../services/studentStore');
const { selectStudents, StudentQueryError, PAGE_SIZE } = require('../services/studentSearch');
const { CATALOG } = require('../services/studentCatalog');

function createStudentRouter(store) {
  const router = express.Router();

  async function renderPage(res, { values, errors = {}, created = '', deleted = false, query = {}, status = 200 }) {
    const allStudents = await store.getAll();
    let selection;
    try {
      selection = selectStudents(allStudents, query);
    } catch (error) {
      if (!(error instanceof StudentQueryError)) throw error;
      return res.status(400).render('error', { status: 400, message: error.message });
    }
    const createdId = typeof created === 'string' && /^[0-9]{8}$/.test(created) &&
      allStudents.some((student) => student.id === created) ? created : '';
    res.status(status).render('students', {
      ...selection, values, errors, createdId, success: Boolean(createdId), majors: MAJORS,
      catalogClasses: CATALOG.classes,
      deleted,
    });
  }

  router.get('/', async (req, res) => {
    await renderPage(res, {
      values: { name: '', email: '', className: '', major: '' },
      created: req.query.created, deleted: req.query.deleted === '1', query: req.query,
    });
  });

  router.post('/', async (req, res) => {
    const result = validateNewStudent(req.body);
    if (!result.isValid) {
      return renderPage(res, { values: result.values, errors: result.errors, status: 422 });
    }
    let student;
    try {
      student = await store.add(result.values);
    } catch (error) {
      if (error instanceof StudentConflictError) {
        return renderPage(res, { values: result.values, errors: error.errors, status: 422 });
      }
      if (error instanceof StudentIdExhaustedError) {
        return renderPage(res, { values: result.values, errors: { form: error.message }, status: 409 });
      }
      throw error;
    }
    // PRG: chỉ redirect sau khi dữ liệu đã được lưu thành công.
    // Đến đúng trang chứa hồ sơ vừa thêm, thay vì chỉ hiện thông báo ở trang 1.
    const students = await store.getAll();
    const page = Math.floor(students.findIndex((item) => item.id === student.id) / PAGE_SIZE) + 1;
    res.redirect(303, `/students?created=${student.id}&page=${page}`);
  });

  function checkDeleteId(req, res, next) {
    if (!isValidStudentId(req.params.id)) {
      return res.status(400).render('error', { status: 400, message: 'MSSV trên URL không hợp lệ.' });
    }
    next();
  }

  function notFound(res) {
    return res.status(404).render('error', { status: 404, message: 'Sinh viên không tồn tại hoặc đã được xóa.' });
  }

  router.get('/:id/delete', checkDeleteId, async (req, res) => {
    try {
      const student = await store.getById(req.params.id);
      // GET chỉ đọc: không reserve mã, không ghi JSON, không xóa.
      res.render('delete-student', { student, majors: MAJORS });
    } catch (error) {
      if (error instanceof StudentNotFoundError) return notFound(res);
      throw error;
    }
  });

  router.post('/:id/delete', checkDeleteId, async (req, res) => {
    try {
      await store.remove(req.params.id);
    } catch (error) {
      if (error instanceof StudentNotFoundError) return notFound(res);
      throw error;
    }
    // PRG: chỉ thành công sau khi ghi JSON xong; về trang 1 để tránh trang rỗng.
    res.redirect(303, '/students?deleted=1');
  });

  return router;
}

module.exports = { createStudentRouter };
