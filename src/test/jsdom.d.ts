declare module "jsdom" {
  export interface JSDOMWindow {
    document: Document;
  }
  export class JSDOM {
    constructor(html?: string, options?: Record<string, unknown>);
    readonly window: JSDOMWindow;
  }
}
