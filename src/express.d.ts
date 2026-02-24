declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        role: "admin" | "teacher" | "student";
      };
      classId?: number;
    }
  }
}

export {};
