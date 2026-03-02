import { prisma } from "./prisma";

export async function withDbRetry<T>(
  operation: () => Promise<T>,
  retries = 1
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (retries > 0) {
      console.log("DB retrying due to cold start...");
      await new Promise((res) => setTimeout(res, 2000));
      return withDbRetry(operation, retries - 1);
    }
    throw error;
  }
}