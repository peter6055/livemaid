import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { withAppBasePath } from "@/lib/auth/withAppBasePath";

describe("withAppBasePath", () => {
  beforeEach(() => {
    delete process.env.AUTH_URL;
  });

  afterEach(() => {
    delete process.env.AUTH_URL;
  });

  it("passes the request through when AUTH_URL is unset", async () => {
    const seen: string[] = [];
    const handler = withAppBasePath((req) => {
      seen.push(req.url);
      return new Response("ok");
    });

    const req = new NextRequest("http://localhost:3000/api/auth/signin");
    await handler(req);

    expect(seen).toEqual(["http://localhost:3000/api/auth/signin"]);
  });

  it("rewrites a stripped /api/auth path onto AUTH_URL pathname", async () => {
    process.env.AUTH_URL = "http://localhost:24555/3434/api/auth";
    const seen: string[] = [];
    const handler = withAppBasePath((req) => {
      seen.push(req.url);
      return new Response("ok");
    });

    const req = new NextRequest("http://127.0.0.1:25101/api/auth/signin/oidc?x=1");
    await handler(req);

    expect(seen).toEqual(["http://localhost:24555/3434/api/auth/signin/oidc?x=1"]);
  });

  it("rewrites origin only when the path already includes the Auth basePath", async () => {
    process.env.AUTH_URL = "http://localhost:24555/3434/api/auth";
    const seen: string[] = [];
    const handler = withAppBasePath((req) => {
      seen.push(req.url);
      return new Response("ok");
    });

    const req = new NextRequest("http://127.0.0.1:25101/3434/api/auth/session");
    await handler(req);

    expect(seen).toEqual(["http://localhost:24555/3434/api/auth/session"]);
  });
});
