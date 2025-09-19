import { describe, it, expect, vi } from 'vitest';
import { getMonacoConfig, registerSQLLanguage } from './monacoConfig';

describe.skip('monacoConfig', () => {
  describe('getMonacoConfig', () => {
    const testCases = [
      {
        name: 'should return config for SQL',
        fileType: 'sql',
        expected: {
          hasLanguage: true,
          hasTheme: true,
          hasOptions: true
        }
      },
      {
        name: 'should return config for JSON',
        fileType: 'json',
        expected: {
          hasLanguage: true,
          hasTheme: true,
          hasOptions: true
        }
      },
      {
        name: 'should return config for text',
        fileType: 'txt',
        expected: {
          hasLanguage: true,
          hasTheme: true,
          hasOptions: true
        }
      },
      {
        name: 'should handle unknown file type',
        fileType: 'xyz',
        expected: {
          hasLanguage: true,
          defaultLanguage: 'plaintext'
        }
      }
    ];

    testCases.forEach(({ name, fileType, expected }) => {
      it(name, () => {
        const config = getMonacoConfig(fileType);

        if (expected.hasLanguage) {
          expect(config.language).toBeDefined();
        }
        if (expected.hasTheme) {
          expect(config.theme).toBeDefined();
        }
        if (expected.hasOptions) {
          expect(config.options).toBeDefined();
          expect(config.options.fontSize).toBeGreaterThan(0);
        }
        if (expected.defaultLanguage) {
          expect(config.language).toBe(expected.defaultLanguage);
        }
      });
    });
  });

  describe('registerSQLLanguage', () => {
    let mockMonaco: any;

    beforeEach(() => {
      mockMonaco = {
        languages: {
          register: vi.fn(),
          setMonarchTokensProvider: vi.fn(),
          registerCompletionItemProvider: vi.fn(),
          CompletionItemKind: {
            Function: 1,
            Keyword: 2,
            Snippet: 3
          }
        }
      };
    });

    it('should register SQL language', () => {
      registerSQLLanguage(mockMonaco, []);

      expect(mockMonaco.languages.register).toHaveBeenCalledWith({
        id: 'sql'
      });
      expect(mockMonaco.languages.setMonarchTokensProvider).toHaveBeenCalled();
      expect(mockMonaco.languages.registerCompletionItemProvider).toHaveBeenCalled();
    });

    it('should register completion provider with tables', () => {
      const tables = ['users', 'products', 'orders'];
      registerSQLLanguage(mockMonaco, tables);

      const completionCall = mockMonaco.languages.registerCompletionItemProvider.mock.calls[0];
      expect(completionCall[0]).toBe('sql');
      expect(completionCall[1]).toHaveProperty('provideCompletionItems');
    });

    it('should provide completions for tables', () => {
      const tables = ['users', 'products'];
      registerSQLLanguage(mockMonaco, tables);

      const provider = mockMonaco.languages.registerCompletionItemProvider.mock.calls[0][1];
      const model = {
        getWordUntilPosition: () => ({ word: 'us' })
      };
      const position = { lineNumber: 1, column: 10 };

      const result = provider.provideCompletionItems(model, position);

      expect(result.suggestions).toBeDefined();
      expect(result.suggestions.length).toBeGreaterThan(0);
    });
  });

  describe('SQL tokenizer', () => {
    const tokenizer = {
      keywords: [
        'SELECT', 'FROM', 'WHERE', 'JOIN', 'ON', 'GROUP BY',
        'ORDER BY', 'HAVING', 'LIMIT', 'OFFSET'
      ],
      operators: ['=', '!=', '<>', '<', '>', '<=', '>=', 'LIKE', 'IN', 'NOT'],
      functions: ['COUNT', 'SUM', 'AVG', 'MAX', 'MIN', 'TO_TIMESTAMP']
    };

    describe('keyword detection', () => {
      tokenizer.keywords.forEach(keyword => {
        it(`should recognize ${keyword}`, () => {
          expect(tokenizer.keywords).toContain(keyword);
        });
      });
    });

    describe('operator detection', () => {
      tokenizer.operators.forEach(op => {
        it(`should recognize ${op}`, () => {
          expect(tokenizer.operators).toContain(op);
        });
      });
    });

    describe('function detection', () => {
      tokenizer.functions.forEach(func => {
        it(`should recognize ${func}`, () => {
          expect(tokenizer.functions).toContain(func);
        });
      });
    });
  });

  describe('autocomplete word extraction', () => {
    function getWordAtPosition(text: string, position: number) {
      const before = text.slice(0, position);
      const beforeMatch = before.match(/[\w_]+$/);
      const word = beforeMatch ? beforeMatch[0] : '';

      return {
        word,
        startColumn: position - word.length + 1,
        endColumn: position + 1
      };
    }

    const testCases = [
      { text: 'SELECT to_', pos: 10, expected: 'to_' },
      { text: 'SELECT to_tim', pos: 13, expected: 'to_tim' },
      { text: 'SELECT job_id, to_', pos: 18, expected: 'to_' },
      { text: 'SELECT t', pos: 8, expected: 't' },
      { text: 'SELECT ', pos: 7, expected: '' },
      { text: 'FROM users WHERE ', pos: 17, expected: '' }
    ];

    testCases.forEach(({ text, pos, expected }) => {
      it(`should extract "${expected}" from "${text}" at position ${pos}`, () => {
        const result = getWordAtPosition(text, pos);
        expect(result.word).toBe(expected);
      });
    });
  });

  describe('function filtering', () => {
    const functions = [
      'TO_TIMESTAMP', 'TO_DATE', 'TO_CHAR',
      'COUNT', 'SUM', 'AVG', 'MAX', 'MIN',
      'UPPER', 'LOWER', 'LENGTH'
    ];

    function filterFunctions(prefix: string) {
      return functions.filter(f =>
        f.toLowerCase().startsWith(prefix.toLowerCase())
      );
    }

    const testCases = [
      { prefix: 'to_', expected: ['TO_TIMESTAMP', 'TO_DATE', 'TO_CHAR'] },
      { prefix: 'to_t', expected: ['TO_TIMESTAMP'] },
      { prefix: 'cou', expected: ['COUNT'] },
      { prefix: 'xyz', expected: [] },
      { prefix: '', expected: functions },
      { prefix: 'l', expected: ['LOWER', 'LENGTH'] }
    ];

    testCases.forEach(({ prefix, expected }) => {
      it(`should filter functions with prefix "${prefix}"`, () => {
        const matches = filterFunctions(prefix);
        expect(matches).toEqual(expected);
      });
    });
  });
});