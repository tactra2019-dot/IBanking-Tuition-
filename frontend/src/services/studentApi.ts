import { client, isDemo } from "./client";
import type { Student } from "../types";
export const studentApi = {
  lookup: async (id: string): Promise<Student> => {
    if (isDemo) return (await client.get(`/students/${encodeURIComponent(id)}/tuition`)).data;
    const fee = (await client.get(`/tuitions/student/${encodeURIComponent(id)}`)).data.data;
    return { id: fee.studentCode, fullName: fee.studentName, amount: fee.amount, tuitionStatus: fee.status, semester: fee.semester };
  },
};
