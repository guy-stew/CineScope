/**
 * CineScope — Report Template Editor (v3.5 — Stage 3)
 *
 * Collapsible editor for AI prompt templates.
 * Shows a monospace text area with placeholder highlighting,
 * an available-placeholders reference panel, and Save/Reset buttons.
 *
 * Props:
 *   reportType   - string: 'insights' | 'chain' etc.
 *   template     - string: current template text
 *   onChange      - function(newText): called on every edit
 *   onSave       - function(): persist to cloud
 *   onReset      - function(): reset to default
 *   saving       - boolean: save in progress
 *   isModified   - boolean: template differs from saved version
 *   placeholders - array of { token, description }
 *   theme        - theme object from ThemeContext
 */

import React, { useState, useRef, useCallback } from 'react'
import Icon from './Icon'

export default function ReportTemplateEditor({
  reportType,
  template,
  onChange,
  onSave,
  onReset,
  saving,
  isModified,
  placeholders,
  theme,
}) {
  const [showRef, setShowRef] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const textareaRef = useRef(null)

  // Insert placeholder token at cursor position
  const insertPlaceholder = useCallback((token) => {
    const ta = textareaRef.current
    if (!ta) return
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const before = template.slice(0, start)
    const after = template.slice(end)
    const newText = before + token + after
    onChange(newText)
    // Restore cursor after the inserted token
    requestAnimationFrame(() => {
      ta.selectionStart = ta.selectionEnd = start + token.length
      ta.focus()
    })
  }, [template, onChange])

  const handleReset = useCallback(() => {
    if (!confirmReset) {
      setConfirmReset(true)
      return
    }
    onReset()
    setConfirmReset(false)
  }, [confirmReset, onReset])


  // ── Styles ──

  const editorBg = theme.surface
  const editorBorder = theme.border
  const accentColor = theme.headerBorder
  const mutedColor = theme.textMuted

  return (
    <div style={{
      margin: '0 24px 16px',
      borderRadius: 10,
      border: `1px solid ${editorBorder}`,
      background: editorBg,
      overflow: 'hidden',
    }}>

      {/* ── Editor Header ── */}
      <div style={{
        padding: '10px 16px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderBottom: `1px solid ${editorBorder}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name="edit_note" size={18} style={{ color: accentColor }} />
          <span style={{ fontWeight: 600, fontSize: '0.82rem', color: theme.text }}>
            Prompt Template
          </span>
          {isModified && (
            <span style={{
              fontSize: '0.65rem', fontWeight: 600,
              background: '#f5c54233', color: '#f5c542',
              padding: '2px 7px', borderRadius: 4,
            }}>
              UNSAVED
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {/* Placeholder reference toggle */}
          <button
            onClick={() => setShowRef(prev => !prev)}
            style={{
              padding: '4px 10px', borderRadius: 5,
              border: `1px solid ${editorBorder}`,
              background: showRef ? `${accentColor}18` : 'transparent',
              color: showRef ? accentColor : mutedColor,
              fontSize: '0.75rem', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 4,
            }}
          >
            <Icon name="data_object" size={13} />
            Placeholders
          </button>

          {/* Reset button */}
          <button
            onClick={handleReset}
            onBlur={() => setConfirmReset(false)}
            style={{
              padding: '4px 10px', borderRadius: 5,
              border: `1px solid ${confirmReset ? '#ef4444' : editorBorder}`,
              background: confirmReset ? '#ef444418' : 'transparent',
              color: confirmReset ? '#ef4444' : mutedColor,
              fontSize: '0.75rem', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 4,
            }}
          >
            <Icon name="restart_alt" size={13} />
            {confirmReset ? 'Confirm reset?' : 'Reset'}
          </button>

          {/* Save button */}
          <button
            onClick={onSave}
            disabled={saving || !isModified}
            style={{
              padding: '4px 12px', borderRadius: 5,
              border: 'none',
              background: (!isModified || saving) ? editorBorder : accentColor,
              color: '#fff',
              fontSize: '0.75rem', fontWeight: 600,
              cursor: (!isModified || saving) ? 'not-allowed' : 'pointer',
              opacity: (!isModified || saving) ? 0.5 : 1,
              display: 'flex', alignItems: 'center', gap: 4,
            }}
          >
            <Icon name={saving ? 'progress_activity' : 'cloud_upload'} size={13} />
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      {/* ── Placeholder Reference Panel ── */}
      {showRef && placeholders && placeholders.length > 0 && (
        <div style={{
          padding: '10px 16px',
          borderBottom: `1px solid ${editorBorder}`,
          background: `${accentColor}06`,
        }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 600, color: mutedColor, marginBottom: 8 }}>
            Available Placeholders — click to insert at cursor
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {placeholders.map(p => (
              <button
                key={p.token}
                onClick={() => insertPlaceholder(p.token)}
                title={p.description}
                style={{
                  padding: '4px 8px', borderRadius: 5,
                  border: `1px solid ${editorBorder}`,
                  background: theme.body,
                  color: accentColor,
                  fontSize: '0.72rem', fontFamily: 'monospace',
                  cursor: 'pointer',
                  transition: 'all 0.1s ease',
                }}
                onMouseEnter={e => e.currentTarget.style.background = `${accentColor}18`}
                onMouseLeave={e => e.currentTarget.style.background = theme.body}
              >
                {p.token}
              </button>
            ))}
          </div>
          <div style={{ marginTop: 8, fontSize: '0.68rem', color: mutedColor, lineHeight: 1.5 }}>
            {placeholders.map(p => (
              <div key={p.token} style={{ marginBottom: 2 }}>
                <code style={{ color: accentColor, fontFamily: 'monospace' }}>{p.token}</code>
                {' — '}{p.description}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Text Area ── */}
      <div style={{ padding: '12px 16px' }}>
        <textarea
          ref={textareaRef}
          value={template}
          onChange={e => onChange(e.target.value)}
          spellCheck={false}
          style={{
            width: '100%',
            minHeight: 320,
            padding: 12,
            borderRadius: 6,
            border: `1px solid ${editorBorder}`,
            background: theme.body,
            color: theme.text,
            fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace',
            fontSize: '0.78rem',
            lineHeight: 1.65,
            resize: 'vertical',
            outline: 'none',
          }}
          onFocus={e => e.target.style.borderColor = accentColor}
          onBlur={e => e.target.style.borderColor = editorBorder}
        />
        <div style={{
          marginTop: 6, fontSize: '0.68rem', color: mutedColor,
          display: 'flex', justifyContent: 'space-between',
        }}>
          <span>
            Edit this template to change what the AI analyses and how it structures the report.
            Use {'{{placeholders}}'} for dynamic data.
          </span>
          <span>{template.length} chars</span>
        </div>
      </div>
    </div>
  )
}
