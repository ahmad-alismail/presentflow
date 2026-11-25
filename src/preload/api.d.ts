import type { PresentFlowApi } from '../shared/ipc'

declare global {
  interface Window {
    presentflow: PresentFlowApi
  }
}

export {}
