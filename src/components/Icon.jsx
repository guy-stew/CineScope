/**
 * CineScope — Material Symbol Icon Component
 * Uses Google Material Symbols — Rounded, 400 weight, unfilled
 * 
 * Usage: <Icon name="settings" size={20} />
 *        <Icon name="movie" className="me-2" />
 */
import React from 'react'

export default function Icon({ name, size = 20, className = '', style = {}, ...props }) {
  return (
    <span
      className={`material-symbols-rounded ${className}`}
      style={{
        fontSize: size,
        lineHeight: 1,
        verticalAlign: 'middle',
        ...style,
      }}
      aria-hidden="true"
      {...props}
    >
      {name}
    </span>
  )
}
