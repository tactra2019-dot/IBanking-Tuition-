import { Request, Response } from 'express';
import { sendError, sendSuccess } from '../../shared/response';
import { studentService } from '../services/student.service';

export const studentController = {
  async getStudent(req: Request, res: Response) {
    try {
      const student = await studentService.findByCode(String(req.params.studentCode));
      if (!student) return sendError(res, 'Không tìm thấy sinh viên', 404);
      return sendSuccess(res, student);
    } catch (err: any) {
      return sendError(res, 'Lỗi tra cứu sinh viên', 500, err.message);
    }
  },

  async getTuition(req: Request, res: Response) {
    try {
      const tuition = await studentService.getTuitionByStudentCode(String(req.params.studentCode));
      if (!tuition) return sendError(res, 'Không tìm thấy thông tin học phí của sinh viên', 404);
      return sendSuccess(res, tuition);
    } catch (err: any) {
      return sendError(res, 'Lỗi tra cứu học phí', 500, err.message);
    }
  },

  async payTuition(req: Request, res: Response) {
    try {
      const result = await studentService.markTuitionPaid(String(req.params.id));
      if (result.error === 'NOT_FOUND') return sendError(res, 'Không tìm thấy khoản học phí', 404);
      if (result.error === 'ALREADY_PAID') return sendError(res, 'Học phí đã được thanh toán trước đó', 409);
      return sendSuccess(res, result.data, 'Cập nhật trạng thái học phí PAID thành công');
    } catch (err: any) {
      return sendError(res, 'Lỗi cập nhật học phí', 500, err.message);
    }
  },
};

