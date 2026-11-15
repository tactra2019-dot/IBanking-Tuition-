import { Request, Response } from 'express';
import { sendError, sendSuccess } from '../../shared/response';
import { studentService } from '../services/student.service';

export const studentController = {
  async getStudent(req: Request, res: Response) {
    try {
      const student = await studentService.findByCode(String(req.params.studentCode));
      if (!student) return sendError(res, 'Không tìm thấy sinh viên', 404);
      return sendSuccess(res, student);
    } catch {
      return sendError(res, 'Lỗi tra cứu sinh viên', 500);
    }
  },

  async getTuition(req: Request, res: Response) {
    try {
      const tuition = await studentService.getTuitionByStudentCode(String(req.params.studentCode));
      if (!tuition) return sendError(res, 'Không tìm thấy thông tin học phí của sinh viên', 404);
      return sendSuccess(res, tuition);
    } catch {
      return sendError(res, 'Lỗi tra cứu học phí', 500);
    }
  },

};
