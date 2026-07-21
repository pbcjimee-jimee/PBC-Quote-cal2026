import type { ProgressClaimEditorDto } from './claim-service'

export function progressClaimEditorKey(editor: ProgressClaimEditorDto): string {
  return [editor.seriesVersion, editor.claimVersion ?? 'new', editor.expectedCurrentRevisionSetId ?? 'none', editor.expectedCurrentManifestHash ?? 'none'].join(':')
}
