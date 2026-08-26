'use client'

import { useEffect, useRef, useState } from 'react'

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'
const maxImageSize = 10 * 1024 * 1024
const maxVideoSize = 100 * 1024 * 1024

export function CreatePostModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [files, setFiles] = useState<File[]>([])
  const [caption, setCaption] = useState('')
  const [status, setStatus] = useState('')
  const [submitting, setSubmitting] = useState(false)
  useEffect(() => {
    if (open) dialog.current?.showModal()
    else dialog.current?.close()
  }, [open])
  function selectFiles(selected: FileList | null) {
    const next = Array.from(selected ?? [])
    const invalid = next.find(
      (file) =>
        (!file.type.startsWith('image/') && !file.type.startsWith('video/')) ||
        file.size > (file.type.startsWith('video/') ? maxVideoSize : maxImageSize),
    )
    if (invalid) {
      setStatus(`Arquivo inválido: ${invalid.name}`)
      return
    }
    if (next.length > 10) {
      setStatus('Selecione no máximo 10 arquivos')
      return
    }
    setStatus('')
    setFiles(next)
  }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!files.length) {
      setStatus('Selecione pelo menos um arquivo')
      return
    }
    setSubmitting(true)
    setStatus('Enviando mídia...')
    try {
      const media = []
      for (const file of files) {
        const form = new FormData()
        form.append('file', file)
        const response = await fetch(`${apiUrl}/api/v1/uploads`, { method: 'POST', credentials: 'include', body: form })
        if (!response.ok) throw new Error(await response.text())
        media.push(await response.json())
      }
      const response = await fetch(`${apiUrl}/api/v1/posts`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ caption, media }),
      })
      if (!response.ok) throw new Error(await response.text())
      setFiles([])
      setCaption('')
      setStatus('')
      onClose()
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Não foi possível publicar')
    } finally {
      setSubmitting(false)
    }
  }
  return (
    <dialog ref={dialog} className="create-modal" onCancel={onClose} onClose={onClose} aria-labelledby="create-title">
      <form onSubmit={submit}>
        <button className="modal-close" type="button" onClick={onClose} aria-label="Fechar">
          ×
        </button>
        <h2 id="create-title">Nova publicação</h2>
        <label htmlFor="media-file">Imagens ou vídeos</label>
        <input
          id="media-file"
          name="media-file"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime"
          multiple
          required
          onChange={(event) => selectFiles(event.target.files)}
        />
        <small>{files.length ? `${files.length} arquivo(s) selecionado(s)` : 'Até 10 imagens ou vídeos'}</small>
        <label htmlFor="caption">Legenda</label>
        <textarea
          id="caption"
          name="caption"
          value={caption}
          onChange={(event) => setCaption(event.target.value)}
          maxLength={2200}
          placeholder="Compartilhe algo..."
        />
        {status && (
          <p role="status" className="form-status">
            {status}
          </p>
        )}
        <div className="modal-actions">
          <button className="secondary" type="button" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" disabled={submitting}>
            {submitting ? 'Publicando...' : 'Publicar'}
          </button>
        </div>
      </form>
    </dialog>
  )
}
