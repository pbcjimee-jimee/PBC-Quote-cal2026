export type AreaScope = 'interior' | 'exterior' | 'roof'

export interface AreaRecord {
  id: string
  scope: AreaScope
  name: string
  active: boolean
  position: number
  createdAt?: string
  updatedAt?: string
}
