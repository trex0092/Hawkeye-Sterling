// Hawkeye Sterling — AST-based compliance rule engine (Marble-inspired).
//
// Allows compliance officers to define detection rules as expressions:
//   "amount > 50000 AND country_risk = 'HIGH' AND pep_flag = true"
//
// Supported operators: >, <, >=, <=, =, !=, AND, OR, NOT, IN, CONTAINS
// Supported field types: number, string, boolean
// Fields: amount, currency, country_risk, pep_flag, entity_type,
//         transaction_count, days_since_kyc, source_of_funds_verified,
//         adverse_media_hits, sanctions_hits, jurisdiction
//
// The engine parses rules into an AST, then evaluates them against a
// transaction/screening context. Rules can be stored and versioned.

export type TokenType =
  | 'NUMBER'
  | 'STRING'
  | 'BOOLEAN'
  | 'IDENTIFIER'
  | 'OPERATOR'
  | 'LOGICAL'
  | 'NOT'
  | 'IN'
  | 'CONTAINS'
  | 'LPAREN'
  | 'RPAREN'
  | 'LBRACKET'
  | 'RBRACKET'
  | 'COMMA'
  | 'EOF';

export interface Token {
  type: TokenType;
  value: string | number | boolean;
  pos: number;
}

export type AstNodeType =
  | 'Comparison'
  | 'Logical'
  | 'Not'
  | 'InCheck'
  | 'ContainsCheck'
  | 'Literal'
  | 'Field';

export interface AstNode {
  type: AstNodeType;
  left?: AstNode;
  right?: AstNode;
  operator?: string;
  value?: string | number | boolean;
  field?: string;
  items?: AstNode[];
}

export interface RuleContext {
  amount?: number;
  currency?: string;
  country_risk?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  pep_flag?: boolean;
  entity_type?: 'person' | 'entity' | 'vessel';
  transaction_count?: number;
  days_since_kyc?: number;
  source_of_funds_verified?: boolean;
  adverse_media_hits?: number;
  sanctions_hits?: number;
  jurisdiction?: string;
  [key: string]: unknown;
}

export interface RuleResult {
  triggered: boolean;
  rule: string;
  context: RuleContext;
  error?: string;
}

// ── Lexer ────────────────────────────────────────────────────────────────────

function tokenize(rule: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < rule.length) {
    // Skip whitespace
    if (/\s/.test(rule[i] ?? '')) { i++; continue; }

    // String literals
    if (rule[i] === "'") {
      let str = '';
      i++; // skip opening quote
      while (i < rule.length && rule[i] !== "'") {
        if (rule[i] === '\\' && i + 1 < rule.length) {
          i++; str += rule[i]; i++; continue;
        }
        str += rule[i]; i++;
      }
      i++; // skip closing quote
      tokens.push({ type: 'STRING', value: str, pos: i });
      continue;
    }

    // Numbers
    if (/\d/.test(rule[i] ?? '') || (rule[i] === '-' && /\d/.test(rule[i + 1] ?? ''))) {
      let num = '';
      if (rule[i] === '-') { num += '-'; i++; }
      while (i < rule.length && /[\d.]/.test(rule[i] ?? '')) { num += rule[i]; i++; }
      tokens.push({ type: 'NUMBER', value: parseFloat(num), pos: i });
      continue;
    }

    // Brackets
    if (rule[i] === '[') { tokens.push({ type: 'LBRACKET', value: '[', pos: i }); i++; continue; }
    if (rule[i] === ']') { tokens.push({ type: 'RBRACKET', value: ']', pos: i }); i++; continue; }
    if (rule[i] === '(') { tokens.push({ type: 'LPAREN', value: '(', pos: i }); i++; continue; }
    if (rule[i] === ')') { tokens.push({ type: 'RPAREN', value: ')', pos: i }); i++; continue; }
    if (rule[i] === ',') { tokens.push({ type: 'COMMA', value: ',', pos: i }); i++; continue; }

    // Operators
    if (rule.startsWith('>=', i)) { tokens.push({ type: 'OPERATOR', value: '>=', pos: i }); i += 2; continue; }
    if (rule.startsWith('<=', i)) { tokens.push({ type: 'OPERATOR', value: '<=', pos: i }); i += 2; continue; }
    if (rule.startsWith('!=', i)) { tokens.push({ type: 'OPERATOR', value: '!=', pos: i }); i += 2; continue; }
    if (rule[i] === '>') { tokens.push({ type: 'OPERATOR', value: '>', pos: i }); i++; continue; }
    if (rule[i] === '<') { tokens.push({ type: 'OPERATOR', value: '<', pos: i }); i++; continue; }
    if (rule[i] === '=') { tokens.push({ type: 'OPERATOR', value: '=', pos: i }); i++; continue; }

    // Keywords and identifiers
    if (/[a-zA-Z_]/.test(rule[i] ?? '')) {
      let word = '';
      while (i < rule.length && /[a-zA-Z0-9_]/.test(rule[i] ?? '')) { word += rule[i]; i++; }
      const upper = word.toUpperCase();
      if (upper === 'AND' || upper === 'OR') {
        tokens.push({ type: 'LOGICAL', value: upper, pos: i });
      } else if (upper === 'NOT') {
        tokens.push({ type: 'NOT', value: 'NOT', pos: i });
      } else if (upper === 'IN') {
        tokens.push({ type: 'IN', value: 'IN', pos: i });
      } else if (upper === 'CONTAINS') {
        tokens.push({ type: 'CONTAINS', value: 'CONTAINS', pos: i });
      } else if (upper === 'TRUE') {
        tokens.push({ type: 'BOOLEAN', value: true, pos: i });
      } else if (upper === 'FALSE') {
        tokens.push({ type: 'BOOLEAN', value: false, pos: i });
      } else {
        tokens.push({ type: 'IDENTIFIER', value: word, pos: i });
      }
      continue;
    }

    throw new Error(`Unexpected character '${rule[i]}' at position ${i}`);
  }

  tokens.push({ type: 'EOF', value: '', pos: i });
  return tokens;
}

// ── Parser ───────────────────────────────────────────────────────────────────

class Parser {
  private tokens: Token[];
  private pos = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  private peek(): Token {
    return this.tokens[this.pos] ?? { type: 'EOF', value: '', pos: -1 };
  }

  private consume(): Token {
    const t = this.peek();
    this.pos++;
    return t;
  }

  private expect(type: TokenType): Token {
    const t = this.consume();
    if (t.type !== type) throw new Error(`Expected ${type} but got ${t.type} ('${t.value}')`);
    return t;
  }

  parse(): AstNode {
    const node = this.parseOr();
    if (this.peek().type !== 'EOF') {
      throw new Error(`Unexpected token at end: '${this.peek().value}'`);
    }
    return node;
  }

  private parseOr(): AstNode {
    let left = this.parseAnd();
    while (this.peek().type === 'LOGICAL' && this.peek().value === 'OR') {
      const op = this.consume().value as string;
      const right = this.parseAnd();
      left = { type: 'Logical', operator: op, left, right };
    }
    return left;
  }

  private parseAnd(): AstNode {
    let left = this.parseNot();
    while (this.peek().type === 'LOGICAL' && this.peek().value === 'AND') {
      const op = this.consume().value as string;
      const right = this.parseNot();
      left = { type: 'Logical', operator: op, left, right };
    }
    return left;
  }

  private parseNot(): AstNode {
    if (this.peek().type === 'NOT') {
      this.consume();
      return { type: 'Not', left: this.parsePrimary() };
    }
    return this.parsePrimary();
  }

  private parsePrimary(): AstNode {
    if (this.peek().type === 'LPAREN') {
      this.consume();
      const node = this.parseOr();
      this.expect('RPAREN');
      return node;
    }

    if (this.peek().type === 'IDENTIFIER') {
      const field = this.consume().value as string;
      const next = this.peek();

      if (next.type === 'OPERATOR') {
        const op = this.consume().value as string;
        const rhs = this.parseLiteral();
        return { type: 'Comparison', field, operator: op, right: rhs };
      }

      if (next.type === 'IN') {
        this.consume();
        this.expect('LBRACKET');
        const items: AstNode[] = [];
        while (this.peek().type !== 'RBRACKET' && this.peek().type !== 'EOF') {
          items.push(this.parseLiteral());
          if (this.peek().type === 'COMMA') this.consume();
        }
        this.expect('RBRACKET');
        return { type: 'InCheck', field, items };
      }

      if (next.type === 'CONTAINS') {
        this.consume();
        const rhs = this.parseLiteral();
        return { type: 'ContainsCheck', field, right: rhs };
      }

      return { type: 'Field', field };
    }

    return this.parseLiteral();
  }

  private parseLiteral(): AstNode {
    const t = this.peek();
    if (t.type === 'NUMBER' || t.type === 'STRING' || t.type === 'BOOLEAN') {
      this.consume();
      return { type: 'Literal', value: t.value as string | number | boolean };
    }
    throw new Error(`Expected literal value but got '${t.value}' (${t.type})`);
  }
}

// ── Evaluator ────────────────────────────────────────────────────────────────

function resolveField(field: string, ctx: RuleContext): unknown {
  return ctx[field] ?? undefined;
}

function evaluate(node: AstNode, ctx: RuleContext): boolean | number | string {
  switch (node.type) {
    case 'Literal':
      return node.value as string | number | boolean;

    case 'Field': {
      if (!node.field) throw new Error('Malformed AST: Field node missing field name');
      const v = resolveField(node.field, ctx);
      if (v === undefined) throw new Error(`Unknown field: ${node.field}`);
      return v as string | number | boolean;
    }

    case 'Comparison': {
      if (!node.field) throw new Error('Malformed AST: Comparison node missing field name');
      if (!node.right) throw new Error('Malformed AST: Comparison node missing right operand');
      const left = resolveField(node.field, ctx);
      const right = evaluate(node.right, ctx);
      switch (node.operator) {
        case '>':  return (left as number) > (right as number);
        case '<':  return (left as number) < (right as number);
        case '>=': return (left as number) >= (right as number);
        case '<=': return (left as number) <= (right as number);
        case '=':  return left === right;
        case '!=': return left !== right;
        default: throw new Error(`Unknown operator: ${node.operator}`);
      }
    }

    case 'Logical': {
      if (!node.left) throw new Error('Malformed AST: Logical node missing left operand');
      if (!node.right) throw new Error('Malformed AST: Logical node missing right operand');
      const leftVal = evaluate(node.left, ctx);
      if (node.operator === 'AND') {
        return Boolean(leftVal) && Boolean(evaluate(node.right, ctx));
      }
      if (node.operator === 'OR') {
        return Boolean(leftVal) || Boolean(evaluate(node.right, ctx));
      }
      throw new Error(`Unknown logical operator: ${node.operator}`);
    }

    case 'Not': {
      if (!node.left) throw new Error('Malformed AST: Not node missing operand');
      return !Boolean(evaluate(node.left, ctx));
    }

    case 'InCheck': {
      if (!node.field) throw new Error('Malformed AST: InCheck node missing field name');
      const fieldVal = resolveField(node.field, ctx);
      return (node.items ?? []).some((item) => evaluate(item, ctx) === fieldVal);
    }

    case 'ContainsCheck': {
      if (!node.field) throw new Error('Malformed AST: ContainsCheck node missing field name');
      if (!node.right) throw new Error('Malformed AST: ContainsCheck node missing right operand');
      const fieldVal = String(resolveField(node.field, ctx) ?? '');
      const searchVal = String(evaluate(node.right, ctx));
      return fieldVal.includes(searchVal);
    }

    default:
      throw new Error(`Unknown AST node type: ${(node as AstNode).type}`);
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

export interface CompiledRule {
  source: string;
  ast: AstNode;
}

export function parseRule(rule: string): CompiledRule {
  const tokens = tokenize(rule);
  const parser = new Parser(tokens);
  const ast = parser.parse();
  return { source: rule, ast };
}

export function evaluateRule(compiled: CompiledRule, ctx: RuleContext): RuleResult {
  try {
    const triggered = Boolean(evaluate(compiled.ast, ctx));
    return { triggered, rule: compiled.source, context: ctx };
  } catch (err) {
    return {
      triggered: false,
      rule: compiled.source,
      context: ctx,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export function evaluateRuleString(rule: string, ctx: RuleContext): RuleResult {
  try {
    const compiled = parseRule(rule);
    return evaluateRule(compiled, ctx);
  } catch (err) {
    return {
      triggered: false,
      rule,
      context: ctx,
      error: `Parse error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ── Rule registry ─────────────────────────────────────────────────────────────

export interface StoredRule {
  id: string;
  name: string;
  description: string;
  rule: string;
  domain: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  enabled: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export const BUILTIN_RULES: StoredRule[] = [
  {
    id: 'dpms_cash_threshold',
    name: 'DPMS Cash Threshold',
    description: 'Flag cash transactions above AED 55,000 in DPMS sector',
    rule: "amount >= 55000 AND currency = 'AED' AND source_of_funds_verified = false",
    domain: 'dpms',
    severity: 'high',
    enabled: true,
    version: 1,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    createdBy: 'system',
  },
  {
    id: 'pep_high_risk_flag',
    name: 'PEP High-Risk Combination',
    description: 'PEP with adverse media hits and unverified source of funds',
    rule: "pep_flag = true AND adverse_media_hits >= 1 AND source_of_funds_verified = false",
    domain: 'pep',
    severity: 'critical',
    enabled: true,
    version: 1,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    createdBy: 'system',
  },
  {
    id: 'high_risk_jurisdiction',
    name: 'High-Risk Jurisdiction Alert',
    description: 'Any transaction involving a critical-risk jurisdiction',
    rule: "country_risk = 'CRITICAL' OR country_risk = 'HIGH'",
    domain: 'general',
    severity: 'high',
    enabled: true,
    version: 1,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    createdBy: 'system',
  },
  {
    id: 'sanctions_hit_block',
    name: 'Sanctions Hit Block',
    description: 'Block any subject with one or more sanctions hits',
    rule: "sanctions_hits >= 1",
    domain: 'sanctions',
    severity: 'critical',
    enabled: true,
    version: 1,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    createdBy: 'system',
  },
];

export function evaluateAllRules(ctx: RuleContext, rules: StoredRule[] = BUILTIN_RULES): Array<StoredRule & { result: RuleResult }> {
  return rules
    .filter((r) => r.enabled)
    .map((r) => ({ ...r, result: evaluateRuleString(r.rule, ctx) }));
}
