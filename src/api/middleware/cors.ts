import { ServerResponse } from "http";

export class CorsMiddleware {
  static apply(res: ServerResponse): void {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  }

  static handleOptions(res: ServerResponse): void {
    CorsMiddleware.apply(res);
    res.writeHead(200);
    res.end();
  }
}

