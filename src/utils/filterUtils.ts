/**
 * Applies boolean filter logic to a string
 * - Space-separated terms are AND'd together
 * - Terms starting with '-' are negated (NOT)
 * - Terms starting with '+' are OR'd with the entire previous expression
 * - Processing happens left-to-right
 *
 * Examples:
 * - "foo bar -baz" → matches if has "foo" AND "bar" AND NOT "baz"
 * - "a b +c" → matches if (a AND b) OR c
 * - "a +b c" → matches if (a OR b) AND c
 * - "a +b c +d" → matches if ((a OR b) AND c) OR d
 */
export function matchesFilter(text: string, filter: string): boolean {
  const lowerText = text.toLowerCase();
  const terms = filter.trim().toLowerCase().split(/\s+/).filter(Boolean);

  if (terms.length === 0) return true;

  // Process terms left to right, building up the result
  let result: boolean | null = null;
  let i = 0;

  while (i < terms.length) {
    // Collect terms until we hit a +term
    const andTerms: string[] = [];

    while (i < terms.length) {
      const term = terms[i];

      if (term.startsWith('+')) {
        // This is an OR - evaluate what we have so far
        if (andTerms.length > 0) {
          const andResult = evaluateAndTerms(lowerText, andTerms);
          result = result === null ? andResult : (result && andResult);
          andTerms.length = 0;
        }

        // Now OR with this term
        const orTerm = term.slice(1);
        if (orTerm) {
          const orResult = evaluateTerm(lowerText, orTerm);
          result = result === null ? orResult : (result || orResult);
        }
        i++;
        break; // Start collecting new AND terms after the OR
      } else {
        andTerms.push(term);
        i++;
      }
    }

    // Evaluate any remaining AND terms
    if (andTerms.length > 0) {
      const andResult = evaluateAndTerms(lowerText, andTerms);
      result = result === null ? andResult : (result && andResult);
    }
  }

  return result ?? true;
}

function evaluateAndTerms(text: string, terms: string[]): boolean {
  for (const term of terms) {
    if (!evaluateTerm(text, term)) {
      return false;
    }
  }
  return true;
}

function evaluateTerm(text: string, term: string): boolean {
  if (term.startsWith('-')) {
    const searchTerm = term.slice(1);
    return searchTerm ? !text.includes(searchTerm) : true;
  }
  return term ? text.includes(term) : true;
}