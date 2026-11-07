import 'dotenv/config';
import { app as accountApp } from './mock-account-service';
import { app as paymentApp } from './payment-service';
import { app as studentApp } from './student-service';

const pStudent = Number(process.env.PORT_STUDENT) || 4001;
const pPayment = Number(process.env.PORT_PAYMENT) || 4002;
const pAccount = Number(process.env.PORT_ACCOUNT_MOCK) || 4003;

studentApp.listen(pStudent, () => console.log(`[student-service]      http://localhost:${pStudent} (Swagger: /docs)`));
paymentApp.listen(pPayment, () => console.log(`[payment-service]      http://localhost:${pPayment} (Swagger: /docs)`));
accountApp.listen(pAccount, () => console.log(`[mock-account-service] http://localhost:${pAccount}`));
