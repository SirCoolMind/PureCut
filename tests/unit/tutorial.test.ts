import { describe, it, expect } from 'vitest'
import {
  TUTORIAL_STEPS,
  TUTORIAL_NAMES,
  stepsForStage,
  stageAt
} from '../../src/core/tutorial.js'

/**
 * Unit tests for the guided-tour step model.
 *
 * The model is deliberately pure data + pure helpers, so the ordering guarantees
 * the tour UI depends on can be asserted without a DOM or a mounted component.
 * These are the invariants the overlay and `useTutorial` rely on:
 *  - every step id is unique (the overlay looks targets up by id)
 *  - landing steps come before studio steps
 *  - a stage always has at least one step, so `currentStep` is never null mid-tour
 */

describe('TUTORIAL_STEPS', () => {
  it('starts with a docked welcome step and ends in the studio', () => {
    expect(TUTORIAL_STEPS[0].id).toBe('')
    expect(TUTORIAL_STEPS[0].stage).toBe('landing')
    expect(TUTORIAL_STEPS[TUTORIAL_STEPS.length - 1].stage).toBe('studio')
  })

  it('defines the requested names for the independent front and process tours', () => {
    expect(TUTORIAL_NAMES.landing).toBe('Tutorial 1 - Front')
    expect(TUTORIAL_NAMES.studio).toBe('Tutorial 2 - Process')
  })

  it('gives every targeted step a unique id', () => {
    const ids = TUTORIAL_STEPS.filter((s) => s.id).map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('has a title and body for every step', () => {
    for (const step of TUTORIAL_STEPS) {
      expect(step.title.length).toBeGreaterThan(0)
      expect(step.body.length).toBeGreaterThan(0)
    }
  })
})

describe('stepsForStage', () => {
  it('splits the script into landing and studio without losing a step', () => {
    const landing = stepsForStage('landing')
    const studio = stepsForStage('studio')
    expect(landing.length).toBeGreaterThan(0)
    expect(studio.length).toBeGreaterThan(0)
    expect(landing.length + studio.length).toBe(TUTORIAL_STEPS.length)
  })

  it('returns only steps of the requested stage', () => {
    expect(stepsForStage('landing').every((s) => s.stage === 'landing')).toBe(true)
    expect(stepsForStage('studio').every((s) => s.stage === 'studio')).toBe(true)
  })
})

describe('stageAt', () => {
  it('reports the landing stage for the first step', () => {
    expect(stageAt(0)).toBe('landing')
  })

  it('reports the studio stage for the last step', () => {
    expect(stageAt(TUTORIAL_STEPS.length - 1)).toBe('studio')
  })

  it('clamps out-of-range indices instead of returning undefined', () => {
    expect(stageAt(-5)).toBe('landing')
    expect(stageAt(9999)).toBe('studio')
  })
})