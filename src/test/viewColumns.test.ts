import { describe, it, expect } from 'vitest';
import { ACTIVE_COLUMN, planFileOpen, FileOpenPlan } from '../viewColumns';

describe('planFileOpen', () => {
  it('moves the panel beside when it shares the origin column', () => {
    expect(planFileOpen(1, 1)).toEqual<FileOpenPlan>({ movePanelBeside: true, fileTargetColumn: 1 });
  });

  it('moves the panel beside when the panel is not in an editor column', () => {
    expect(planFileOpen(undefined, 1)).toEqual<FileOpenPlan>({ movePanelBeside: true, fileTargetColumn: 1 });
    expect(planFileOpen(ACTIVE_COLUMN, 1)).toEqual<FileOpenPlan>({ movePanelBeside: true, fileTargetColumn: 1 });
  });

  it('leaves the panel in place when it already sits away from the origin column', () => {
    const plan = planFileOpen(2, 1);
    expect(plan.movePanelBeside).toBe(false);
    expect(plan.fileTargetColumn).toBe(1);
  });

  it('always routes the file to the origin column', () => {
    expect(planFileOpen(3, 1).fileTargetColumn).toBe(1);
    expect(planFileOpen(2, 2).movePanelBeside).toBe(true);
  });
});