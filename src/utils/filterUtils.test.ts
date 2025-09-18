import { describe, it, expect } from 'vitest';
import { matchesFilter } from './filterUtils';

describe('matchesFilter', () => {
  describe('basic matching', () => {
    it('should match when filter is empty', () => {
      expect(matchesFilter('any text', '')).toBe(true);
      expect(matchesFilter('any text', '  ')).toBe(true);
    });

    it('should match single term', () => {
      expect(matchesFilter('hello world', 'hello')).toBe(true);
      expect(matchesFilter('hello world', 'world')).toBe(true);
      expect(matchesFilter('hello world', 'foo')).toBe(false);
    });

    it('should be case insensitive', () => {
      expect(matchesFilter('Hello World', 'hello')).toBe(true);
      expect(matchesFilter('hello world', 'HELLO')).toBe(true);
    });
  });

  describe('AND logic (space-separated terms)', () => {
    it('should AND multiple terms', () => {
      expect(matchesFilter('foo bar baz', 'foo bar')).toBe(true);
      expect(matchesFilter('foo bar baz', 'foo baz')).toBe(true);
      expect(matchesFilter('foo bar baz', 'foo qux')).toBe(false);
      expect(matchesFilter('foo baz', 'foo bar')).toBe(false);
    });

    it('should handle multiple AND terms', () => {
      expect(matchesFilter('alpha beta gamma delta', 'alpha beta gamma')).toBe(true);
      expect(matchesFilter('alpha beta gamma delta', 'alpha gamma delta')).toBe(true);
      expect(matchesFilter('alpha beta delta', 'alpha beta gamma')).toBe(false);
    });
  });

  describe('NOT logic (- prefix)', () => {
    it('should exclude terms with - prefix', () => {
      expect(matchesFilter('foo bar', 'foo -baz')).toBe(true);
      expect(matchesFilter('foo bar baz', 'foo -baz')).toBe(false);
    });

    it('should handle multiple NOT terms', () => {
      expect(matchesFilter('foo bar', 'foo -baz -qux')).toBe(true);
      expect(matchesFilter('foo bar baz', 'foo -baz -qux')).toBe(false);
      expect(matchesFilter('foo bar qux', 'foo -baz -qux')).toBe(false);
    });

    it('should combine AND and NOT', () => {
      expect(matchesFilter('foo bar', 'foo bar -baz')).toBe(true);
      expect(matchesFilter('foo bar baz', 'foo bar -baz')).toBe(false);
    });
  });

  describe('OR logic (+ prefix)', () => {
    it('should OR terms with + prefix', () => {
      expect(matchesFilter('foo', 'foo +bar')).toBe(true);
      expect(matchesFilter('bar', 'foo +bar')).toBe(true);
      expect(matchesFilter('baz', 'foo +bar')).toBe(false);
    });

    it('should handle (a AND b) OR c pattern', () => {
      // "a b +c" should match if (has a AND has b) OR has c
      expect(matchesFilter('alpha beta', 'alpha beta +gamma')).toBe(true);
      expect(matchesFilter('gamma', 'alpha beta +gamma')).toBe(true);
      expect(matchesFilter('alpha', 'alpha beta +gamma')).toBe(false);
      expect(matchesFilter('beta', 'alpha beta +gamma')).toBe(false);
      expect(matchesFilter('delta', 'alpha beta +gamma')).toBe(false);
    });

    it('should handle (a OR b) AND c pattern', () => {
      // "a +b c" should match if (has a OR has b) AND has c
      expect(matchesFilter('alpha gamma', 'alpha +beta gamma')).toBe(true);
      expect(matchesFilter('beta gamma', 'alpha +beta gamma')).toBe(true);
      expect(matchesFilter('alpha beta gamma', 'alpha +beta gamma')).toBe(true);
      expect(matchesFilter('alpha', 'alpha +beta gamma')).toBe(false);
      expect(matchesFilter('beta', 'alpha +beta gamma')).toBe(false);
      expect(matchesFilter('gamma', 'alpha +beta gamma')).toBe(false);
    });

    it('should handle a +b c pattern variant', () => {
      // Test the specific example from the user
      expect(matchesFilter('a c', 'a +b c')).toBe(true);
      expect(matchesFilter('b c', 'a +b c')).toBe(true);
      expect(matchesFilter('a b c', 'a +b c')).toBe(true);
      expect(matchesFilter('a', 'a +b c')).toBe(false);
      expect(matchesFilter('b', 'a +b c')).toBe(false);
      expect(matchesFilter('c', 'a +b c')).toBe(false);
    });
  });

  describe('complex combinations', () => {
    it('should handle foo bar -baz', () => {
      expect(matchesFilter('foo bar', 'foo bar -baz')).toBe(true);
      expect(matchesFilter('foo bar qux', 'foo bar -baz')).toBe(true);
      expect(matchesFilter('foo bar baz', 'foo bar -baz')).toBe(false);
      expect(matchesFilter('foo baz', 'foo bar -baz')).toBe(false);
      expect(matchesFilter('bar baz', 'foo bar -baz')).toBe(false);
    });

    it('should handle a b +c pattern', () => {
      expect(matchesFilter('a b', 'a b +c')).toBe(true);
      expect(matchesFilter('a b d', 'a b +c')).toBe(true);
      expect(matchesFilter('c', 'a b +c')).toBe(true);
      expect(matchesFilter('c d', 'a b +c')).toBe(true);
      expect(matchesFilter('a', 'a b +c')).toBe(false);
      expect(matchesFilter('b', 'a b +c')).toBe(false);
      expect(matchesFilter('d', 'a b +c')).toBe(false);
    });

    it('should handle a +b c pattern', () => {
      expect(matchesFilter('a c', 'a +b c')).toBe(true);
      expect(matchesFilter('b c', 'a +b c')).toBe(true);
      expect(matchesFilter('a b c', 'a +b c')).toBe(true);
      expect(matchesFilter('a', 'a +b c')).toBe(false);
      expect(matchesFilter('b', 'a +b c')).toBe(false);
      expect(matchesFilter('c', 'a +b c')).toBe(false);
      expect(matchesFilter('d c', 'a +b c')).toBe(false);
    });

    it('should handle complex pattern with multiple ORs', () => {
      // "a +b c +d" should be ((a OR b) AND c) OR d
      expect(matchesFilter('a c', 'a +b c +d')).toBe(true);
      expect(matchesFilter('b c', 'a +b c +d')).toBe(true);
      expect(matchesFilter('d', 'a +b c +d')).toBe(true);
      expect(matchesFilter('a', 'a +b c +d')).toBe(false);
      expect(matchesFilter('b', 'a +b c +d')).toBe(false);
      expect(matchesFilter('c', 'a +b c +d')).toBe(false);
    });
  });

  describe('real-world file path examples', () => {
    it('should filter debug logs', () => {
      const path = 'debug/logs/error.log';
      expect(matchesFilter(path, 'debug log')).toBe(true);
      expect(matchesFilter(path, 'debug error')).toBe(true);
      expect(matchesFilter(path, 'debug -error')).toBe(false);
      expect(matchesFilter(path, 'log -debug')).toBe(false);
    });

    it('should filter SQL files', () => {
      const path = 'src/queries/users.sql';
      expect(matchesFilter(path, 'sql')).toBe(true);
      expect(matchesFilter(path, 'sql users')).toBe(true);
      expect(matchesFilter(path, 'sql -test')).toBe(true);
      expect(matchesFilter(path, 'sql test')).toBe(false);
    });

    it('should handle OR patterns for file types', () => {
      expect(matchesFilter('file.js', 'js +ts')).toBe(true);
      expect(matchesFilter('file.ts', 'js +ts')).toBe(true);
      expect(matchesFilter('file.py', 'js +ts')).toBe(false);
    });
  });
});