import { describe, it, expect } from 'vitest';
import { isDefaultTableQuery, extractTablesFromQuery, generateQueryTitle } from './sqlParser';

describe.skip('sqlParser', () => {
  describe('isDefaultTableQuery', () => {
    const testCases = [
      {
        query: 'SELECT * FROM users LIMIT 100',
        table: 'users',
        expected: true
      },
      {
        query: 'select * from users limit 50',
        table: 'users',
        expected: true
      },
      {
        query: 'SELECT * FROM users',
        table: 'users',
        expected: false
      },
      {
        query: 'SELECT id FROM users LIMIT 100',
        table: 'users',
        expected: false
      },
      {
        query: 'SELECT * FROM products LIMIT 100',
        table: 'users',
        expected: false
      },
      {
        query: '',
        table: 'users',
        expected: false
      },
      {
        query: 'SELECT * FROM users LIMIT 100',
        table: undefined,
        expected: false
      }
    ];

    testCases.forEach(({ query, table, expected }) => {
      it(`should return ${expected} for "${query}" with table "${table}"`, () => {
        expect(isDefaultTableQuery(query, table)).toBe(expected);
      });
    });
  });

  describe('extractTablesFromQuery', () => {
    const testCases = [
      {
        query: 'SELECT * FROM users',
        expected: ['users']
      },
      {
        query: 'SELECT * FROM users JOIN orders ON users.id = orders.user_id',
        expected: ['users', 'orders']
      },
      {
        query: 'SELECT * FROM users u JOIN orders o ON u.id = o.user_id',
        expected: ['users', 'orders']
      },
      {
        query: 'SELECT * FROM users -- comment',
        expected: ['users']
      },
      {
        query: '/* multi\nline\ncomment */ SELECT * FROM users',
        expected: ['users']
      },
      {
        query: 'SELECT * FROM users, products',
        expected: ['users']
      },
      {
        query: 'SELECT 1',
        expected: []
      },
      {
        query: '',
        expected: []
      },
      {
        query: 'from table1 join table2 from table3',
        expected: ['table1', 'table2', 'table3']
      }
    ];

    testCases.forEach(({ query, expected }) => {
      it(`should extract ${JSON.stringify(expected)} from "${query}"`, () => {
        expect(extractTablesFromQuery(query)).toEqual(expected);
      });
    });
  });

  describe('generateQueryTitle', () => {
    const testCases = [
      {
        query: 'SELECT * FROM users LIMIT 100',
        sourceTable: 'users',
        expected: 'users'
      },
      {
        query: 'SELECT * FROM users WHERE id > 100',
        sourceTable: 'users',
        expected: 'SELECT ... users'
      },
      {
        query: 'SELECT * FROM users JOIN orders',
        sourceTable: undefined,
        expected: 'SELECT ... users, orders'
      },
      {
        query: 'SELECT * FROM t1 JOIN t2 JOIN t3',
        sourceTable: undefined,
        expected: 'SELECT ... t1, t2, t3'
      },
      {
        query: 'SELECT * FROM t1 JOIN t2 JOIN t3 JOIN t4 JOIN t5',
        sourceTable: undefined,
        expected: 'SELECT ... t1, t2, t3...'
      },
      {
        query: 'SELECT 1',
        sourceTable: undefined,
        expected: 'Query'
      },
      {
        query: '',
        sourceTable: undefined,
        expected: 'Query'
      }
    ];

    testCases.forEach(({ query, sourceTable, expected }) => {
      it(`should generate "${expected}" for query`, () => {
        expect(generateQueryTitle(query, sourceTable)).toBe(expected);
      });
    });
  });

  describe('edge cases', () => {
    it('should handle case insensitive matching', () => {
      expect(isDefaultTableQuery('SELECT * FROM Users LIMIT 100', 'users')).toBe(true);
      expect(isDefaultTableQuery('select * from USERS limit 100', 'Users')).toBe(true);
    });

    it('should handle whitespace variations', () => {
      expect(isDefaultTableQuery('  SELECT  *  FROM  users  LIMIT  100  ', 'users')).toBe(true);
      expect(extractTablesFromQuery('  SELECT  *  FROM  users  ')).toEqual(['users']);
    });

    it('should handle SQL keywords as table names', () => {
      expect(extractTablesFromQuery('SELECT * FROM select')).toEqual(['select']);
      expect(extractTablesFromQuery('SELECT * FROM from')).toEqual(['from']);
    });

    it('should handle nested queries', () => {
      const nested = 'SELECT * FROM (SELECT * FROM users) AS u';
      expect(extractTablesFromQuery(nested)).toEqual(['users']);
    });

    it('should handle null and undefined', () => {
      expect(isDefaultTableQuery(null as any, 'users')).toBe(false);
      expect(extractTablesFromQuery(null as any)).toEqual([]);
      expect(generateQueryTitle(null as any)).toBe('Query');
    });
  });
});