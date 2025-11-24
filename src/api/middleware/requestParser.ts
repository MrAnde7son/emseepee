import { IncomingMessage } from "http";

export class RequestParser {
  static async parseBody(req: IncomingMessage): Promise<unknown> {
    return new Promise((resolve, reject) => {
      let body = "";
      req.on("data", (chunk) => {
        body += chunk.toString();
      });
      req.on("end", () => {
        try {
          resolve(body ? JSON.parse(body) : {});
        } catch (error) {
          reject(error);
        }
      });
      req.on("error", reject);
    });
  }
}

