import React from 'react'
import { useApp } from '../context/AppContext'
import { useTheme } from '../context/ThemeContext'
import { GRADES, GRADE_ORDER } from '../utils/grades'
import Icon from './Icon'

export default function GradeSummary() {
  const { gradeCounts, gradeFilter, setGradeFilter, selectedFilm } = useApp()
  const { theme } = useTheme()

  const total = Object.values(gradeCounts).reduce((a, b) => a + b, 0)

  // Don't show grade cards if no film is loaded
  if (!selectedFilm) {
    return (
      <div
        className="grade-summary-empty mb-3 text-center p-3"
        style={{ background: theme.surfaceAlt, borderRadius: 8 }}
      >
        <div style={{ marginBottom: 4 }}><Icon name="bar_chart" size={32} /></div>
        <div style={{ color: theme.textMuted, fontSize: '0.85rem' }}>
          Import a Comscore file to see grades
        </div>
      </div>
    )
  }

  const handleClick = (grade) => {
    if (gradeFilter.includes(grade)) {
      // Deselect — remove this grade from the filter
      setGradeFilter(gradeFilter.filter(g => g !== grade))
    } else {
      // Select — add this grade to the filter
      setGradeFilter([...gradeFilter, grade])
    }
  }

  return (
    <div className="grade-summary mb-3">
      <div className="d-flex gap-2">
        {GRADE_ORDER.map(grade => {
          const info = GRADES[grade]
          const count = gradeCounts[grade] || 0
          const isActive = gradeFilter.includes(grade)
          const pct = total > 0 ? Math.round((count / total) * 100) : 0

          return (
            <div
              key={grade}
              className="grade-card flex-fill text-center"
              style={{
                borderTop: `4px solid ${info.color}`,
                backgroundColor: isActive ? info.color : theme.cardBg,
                border: isActive ? `2px solid ${info.color}` : `1px solid ${theme.border}`,
                borderTopColor: info.color,
                cursor: 'pointer',
                borderRadius: 6,
                padding: '8px 4px',
                transition: 'all 0.15s ease',
              }}
              onClick={() => handleClick(grade)}
              title={info.description}
            >
              <div style={{ fontWeight: 800, fontSize: '0.85rem', color: isActive ? '#fff' : theme.textMuted }}>{grade}</div>
              <div style={{ fontWeight: 700, fontSize: '1.3rem', color: isActive ? '#fff' : theme.text, lineHeight: 1.2 }}>{count}</div>
              <div style={{ fontSize: '0.7rem', color: isActive ? 'rgba(255,255,255,0.85)' : theme.textMuted }}>{pct}%</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
