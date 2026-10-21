import { describe, expect, it } from 'vitest';
import { TASKS, LANES, grade, makePrompt, normalizeAnswer, aggregate } from './experiment';

describe('answer grading', () => {
  it('accepts normalized answers, not substring guesses', () => {
    const task = TASKS.find(t => t.id === 'p01')!;
    expect(grade(task, 'ANSWER: yes.')).toBe(true);
    expect(grade(task, 'yes, I think so')).toBe(false);
    expect(grade(task, 'no')).toBe(false);
    expect(normalizeAnswer(' `false.` ')).toBe('FALSE');
  });
  it('never includes expected answers in new tasks or cross-contaminates phases', () => {
    expect(TASKS.filter(t => t.phase === 'practice')).toHaveLength(6);
    expect(TASKS.filter(t => t.phase === 'holdout')).toHaveLength(6);
    expect(new Set(TASKS.map(t => t.id)).size).toBe(TASKS.length);
    for (const lane of LANES) for (const task of TASKS) {
      const prompt = makePrompt(task, lane.id);
      expect(prompt).toContain(task.question);
      expect(prompt).toContain('ONLY');
    }
  });
  it('aggregates empty rows safely', () => {
    expect(aggregate([])).toEqual({ total: 0, correct: 0, accuracy: 0, latencyMs: 0 });
  });
});
