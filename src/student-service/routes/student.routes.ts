import { Router } from 'express';
import { studentController } from '../controllers/student.controller';

export const studentRouter = Router();

studentRouter.get('/students/:studentCode', studentController.getStudent);
studentRouter.get('/tuitions/student/:studentCode', studentController.getTuition);
studentRouter.patch('/tuitions/:id/pay', studentController.payTuition);

