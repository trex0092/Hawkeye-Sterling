// Minimal ambient declaration for @opentelemetry/resources.
// The package is an optional peer dependency (lazily imported in instrumentation.ts
// to keep it out of the edge-runtime bundle). This declaration gives tsc enough
// information to type-check the dynamic import without the package installed or
// a broad @ts-ignore suppression.
declare module '@opentelemetry/resources' {
  export class Resource {
    constructor(attributes: Record<string, string>);
  }
}
