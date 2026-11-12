import { createContext, useContext } from 'react'
import { DEMO_PROJECTS, type Project } from './projects'

/** The projects the hub currently shows: live ones from the agent service, or the labelled demo ones. */
export const ProjectsContext = createContext<Project[]>(DEMO_PROJECTS)

export const useProjects = (): Project[] => useContext(ProjectsContext)

/** The project with this id, or the first one when the id is missing or unknown. */
export function findProject(projects: Project[], id: string | null | undefined): Project {
  return projects.find((p) => p.id === id) ?? projects[0] ?? DEMO_PROJECTS[0]
}
