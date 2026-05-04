import type { FastifyInstance } from "fastify";
import { AppError } from "./errors.js";

export async function errorHandler(app: FastifyInstance) {
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        error: error.code,
        message: error.message,
      });
    }
    app.log.error(error);
    return reply.status(500).send({
      error: "INTERNAL_ERROR",
      message: "An unexpected error occurred",
    });
  });
}
