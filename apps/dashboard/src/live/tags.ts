import type { Project } from '../projects'

/** The word that ends a number label in the scene: where the number comes from. Demo data says demo, live data says what it is. */
export function dataTag(project: Pick<Project, 'source' | 'planKnown'>): string {
  if (project.source === 'demo') return 'demo'
  return project.planKnown ? 'agent plan' : 'no plan data'
}
