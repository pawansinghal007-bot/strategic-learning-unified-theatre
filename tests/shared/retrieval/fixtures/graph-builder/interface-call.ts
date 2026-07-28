/**
 * interface-call.ts — triggers targetNameForDeclaration null fallthrough (line 437)
 *
 * When a variable has an interface type and a method is called on it, the
 * TS checker resolves the call to a MethodSignature on the interface.
 * MethodSignature is not handled by targetNameForDeclaration, so it falls
 * through all branches and returns null (line 437).
 *
 * Also triggers line 423 via `new NamedClass()` if NewExpression were tracked,
 * but since only CallExpression is tracked, line 423 needs a different approach:
 * a function that IS a class (e.g. a class used as a callable factory pattern).
 */

interface Processor {
  process(input: string): string;
  validate(input: string): boolean;
}

export function runProcessor(p: Processor): string {
  // p.process and p.validate resolve to MethodSignature declarations on the
  // Processor interface — targetNameForDeclaration returns null for MethodSignature.
  const valid = p.validate("test"); // MethodSignature → line 437
  return valid ? p.process("test") : ""; // MethodSignature → line 437
}

export class ConcreteProcessor implements Processor {
  process(input: string): string {
    return input.toUpperCase();
  }
  validate(input: string): boolean {
    return input.length > 0;
  }
}
