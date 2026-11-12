import { createContext, useContext } from 'react'
import { settingsFor, type QualitySettings } from './quality'

/** The picture settings in force, for any part of the scene that has a cheaper way to draw itself. */
export const QualityContext = createContext<QualitySettings>(settingsFor('high'))

export const useQuality = (): QualitySettings => useContext(QualityContext)
