export const DEPARTMENTS = ['planning', 'development', 'review'] as const
export type Department = (typeof DEPARTMENTS)[number]

export type Vec3 = [number, number, number]
