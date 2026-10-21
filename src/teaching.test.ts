import { describe, expect, it } from 'vitest';
import { CURRICULUM, LESSONS, baselinePrompt, coachedPrompt, normalize, score, teacherPrompt, verdict } from './teaching';

describe('R1 teaching curriculum and grading', () => {
  it('pins a version, unique tasks and closed-reference answers', () => {
    expect(CURRICULUM).toMatch(/^philearn-r1-/);
    expect(LESSONS.length).toBeGreaterThanOrEqual(5);
    expect(new Set(LESSONS.map(l => l.id)).size).toBe(LESSONS.length);
    for (const lesson of LESSONS) {
      expect(lesson.example).not.toEqual(lesson.transfer);
      expect(lesson.verifiedTeaching.length).toBeGreaterThan(30);
      expect(lesson.accepted.length).toBeGreaterThan(0);
    }
  });

  it('never sends the transfer challenge or accepted answer to the peer teacher', () => {
    for (const lesson of LESSONS) {
      const prompt = teacherPrompt(lesson);
      expect(prompt).toContain(lesson.example);
      expect(prompt).toContain(lesson.exampleAnswer);
      expect(prompt).not.toContain(lesson.transfer);
    }
  });

  it('holds the transfer task constant between independent baseline and coached prompts', () => {
    for (const lesson of LESSONS) {
      const baseline = baselinePrompt(lesson);
      const coached = coachedPrompt(lesson, lesson.verifiedTeaching);
      expect(baseline).toContain(lesson.transfer);
      expect(coached).toContain(lesson.transfer);
      expect(baseline).not.toContain(lesson.example);
      expect(coached).toContain(lesson.example);
      expect(baseline).toContain('ONLY');
      expect(coached).toContain('ONLY');
    }
  });

  it('scores exact normalized answers, not semantically fuzzy substring matches', () => {
    const lesson = LESSONS.find(l => l.id === 'logic-hex')!;
    expect(score(lesson, 'ANSWER: 2e.')).toBe(true);
    expect(score(lesson, '2E is the answer')).toBe(false);
    expect(score(lesson, '2D')).toBe(false);
    expect(normalize(' "yes." ')).toBe('YES');
  });

  it('uses paired improvement semantics, never calls everything learning', () => {
    expect(verdict(false, true)).toBe('IMPROVED');
    expect(verdict(true, false)).toBe('REGRESSED');
    expect(verdict(true, true)).toBe('UNCHANGED_PASS');
    expect(verdict(false, false)).toBe('UNCHANGED_FAIL');
  });
});
