/**
 * CineScope — Reports View (v3.6.1 — Demographic + Political AI Enrichment)
 *
 * Dedicated view for AI-powered report generation and data export.
 * Card picker selects report type, template editor customises prompts,
 * output panel streams AI text or structured tables.
 *
 * v3.6.1 changes:
 *   - All AI report types now include demographic catchment + political
 *     council data in the prompt via {{demographic_summary}} and
 *     {{political_summary}} template placeholders
 *   - buildEnrichmentForAI() called before each generation (fast — data
 *     is cached from first popup load)
 *
 * All 5 report types wired: AI Insights, Chain Performance,
 * Marketing Targets, Venue Recommendations, CSV Data Export.
 */

import React, { useState, useMemo, useCallback, useEffect } from 'react'
import { useApp } from '../context/AppContext'
import { useTheme } from '../context/ThemeContext'
import { useAuth } from '@clerk/clerk-react'
import { computeTrends, buildTrendSummaryForAI } from '../utils/trendAnalysis'
import { buildChainDataForAI, buildFilmProfileForAI, generateReportFromPrompt, buildEnrichmentForAI } from '../utils/aiReport'
import {
  REPORT_TYPES, PLACEHOLDER_DEFS, TEMPLATE_SETTINGS_KEYS,
  DEFAULT_TEMPLATES, SYSTEM_PROMPTS, substituteTemplate,
} from '../utils/reportTemplates'
import Icon from './Icon'
import FilmSelectorDropdown from './FilmSelectorDropdown'
import ReportTemplateEditor from './ReportTemplateEditor'


export default function ReportsView({ inline = false }) {
  const {
    importedFilms, baseVenues, venues, gradeSettings,
    selectedFilm, selectedFilmId, hasApiKey,
    catalogue, apiClient,
  } = useApp()
  const { theme } = useTheme()
  const { getToken } = useAuth()

  // ── Report state ──
  const [selectedType, setSelectedType] = useState('insights')
  const [reportText, setReportText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [selectedChain, setSelectedChain] = useState('')
  const [copied, setCopied] = useState(false)
  const [marketingData, setMarketingData] = useState(null) // Parsed JSON for marketing table
  const [recsData, setRecsData] = useState(null)           // Parsed JSON for venue recommendations
  const [recsMode, setRecsMode] = useState('missed_opportunity') // 'missed_opportunity' | 'pre_release'
  const [csvData, setCsvData] = useState(null)               // Computed CSV preview rows

  // ── Template state ──
  const [showEditor, setShowEditor] = useState(false)
  const [templates, setTemplates] = useState({})       // { insights: '...', chain: '...' }
  const [savedTemplates, setSavedTemplates] = useState({}) // cloud-saved versions
  const [templateSaving, setTemplateSaving] = useState(false)
  const [templateLoaded, setTemplateLoaded] = useState(false)

  // Current template for selected type
  const currentTemplate = templates[selectedType] || DEFAULT_TEMPLATES[selectedType] || ''
  const savedTemplate = savedTemplates[selectedType] || ''
  const isTemplateModified = currentTemplate !== (savedTemplate || DEFAULT_TEMPLATES[selectedType] || '')

  // ── Load saved templates from settings API on mount ──
  useEffect(() => {
    if (templateLoaded) return
    let cancelled = false

    async function loadTemplates() {
      try {
        const token = await getToken()
        const resp = await fetch('/api/settings', {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!resp.ok) return
        const settings = await resp.json()

        if (cancelled) return

        const loaded = {}
        const saved = {}
        for (const [type, key] of Object.entries(TEMPLATE_SETTINGS_KEYS)) {
          if (settings[key]) {
            loaded[type] = settings[key]
            saved[type] = settings[key]
          }
        }
        setTemplates(loaded)
        setSavedTemplates(saved)
      } catch (err) {
        console.warn('CineScope: Could not load report templates', err)
      } finally {
        if (!cancelled) setTemplateLoaded(true)
      }
    }

    loadTemplates()
    return () => { cancelled = true }
  }, [getToken, templateLoaded])

  // ── Derived data ──

  const filmChains = useMemo(() => {
    if (!selectedFilm || !venues.length) return []
    const chainSet = new Set()
    venues.forEach(v => {
      if (v.chain && v.grade && v.grade !== 'E') chainSet.add(v.chain)
    })
    return [...chainSet].sort()
  }, [selectedFilm, venues])

  // Does the current film have Comscore data?
  const filmHasComscore = !!selectedFilm && venues.some(v => v.grade && v.grade !== 'E')

  // Auto-detect recs mode when switching to venue_recs
  const effectiveRecsMode = filmHasComscore ? recsMode : 'pre_release'

  const canGenerate = useMemo(() => ({
    insights: importedFilms.length >= 2 && hasApiKey,
    chain: !!selectedFilm && !!selectedChain && hasApiKey,
    marketing: !!selectedFilm && hasApiKey && venues.some(v => v.grade === 'B' || v.grade === 'C'),
    venue_recs: hasApiKey && (
      (effectiveRecsMode === 'missed_opportunity' && filmHasComscore) ||
      (effectiveRecsMode === 'pre_release' && (!!selectedFilm || catalogue.length > 0))
    ),
    csv: !!selectedFilm && venues.some(v => v.grade && v.grade !== 'E'),
  }), [importedFilms.length, selectedFilm, selectedChain, hasApiKey, venues, effectiveRecsMode, filmHasComscore, catalogue.length])

  const currentType = REPORT_TYPES.find(t => t.id === selectedType) || REPORT_TYPES[0]


  // ── Handlers ──

  const handleTypeChange = useCallback((typeId) => {
    setSelectedType(typeId)
    setReportText('')
    setError(null)
    setSelectedChain('')
    setCopied(false)
    setMarketingData(null)
    setRecsData(null)
    setCsvData(null)
    // Don't reset showEditor — let it stay open if user was editing
  }, [])

  const handleTemplateChange = useCallback((newText) => {
    setTemplates(prev => ({ ...prev, [selectedType]: newText }))
  }, [selectedType])

  const handleTemplateSave = useCallback(async () => {
    const key = TEMPLATE_SETTINGS_KEYS[selectedType]
    if (!key) return

    setTemplateSaving(true)
    try {
      const token = await getToken()
      const resp = await fetch('/api/settings', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ [key]: currentTemplate }),
      })
      if (resp.ok) {
        setSavedTemplates(prev => ({ ...prev, [selectedType]: currentTemplate }))
      }
    } catch (err) {
      console.error('CineScope: Failed to save template', err)
    } finally {
      setTemplateSaving(false)
    }
  }, [selectedType, currentTemplate, getToken])

  const handleTemplateReset = useCallback(() => {
    const defaultTpl = DEFAULT_TEMPLATES[selectedType] || ''
    setTemplates(prev => ({ ...prev, [selectedType]: defaultTpl }))
  }, [selectedType])


  // ── Generate Report ──

  const handleGenerate = useCallback(async () => {
    if (loading) return
    setLoading(true)
    setError(null)
    setReportText('')
    setCopied(false)
    setMarketingData(null)
    setRecsData(null)
    setCsvData(null)

    try {
      // ── CSV Export (no AI, pure data) ──
      if (selectedType === 'csv') {
        const screenedVenues = venues
          .filter(v => v.grade && v.grade !== 'E')
          .sort((a, b) => (b.revenue || 0) - (a.revenue || 0))

        // Compute national and chain ranks
        const chainGroups = {}
        screenedVenues.forEach((v, i) => {
          v._nationalRank = i + 1
          const chain = v.chain || 'Independent'
          if (!chainGroups[chain]) chainGroups[chain] = []
          chainGroups[chain].push(v)
        })
        Object.values(chainGroups).forEach(group => {
          group.sort((a, b) => (b.revenue || 0) - (a.revenue || 0))
          group.forEach((v, i) => { v._chainRank = i + 1; v._chainTotal = group.length })
        })

        setCsvData(screenedVenues)
        setLoading(false)
        return
      }

      // Get the active template (user-customised or default)
      const tpl = currentTemplate || DEFAULT_TEMPLATES[selectedType] || ''

      if (selectedType === 'insights') {
        // ── Multi-film trend analysis ──
        const trendData = computeTrends(importedFilms, baseVenues, gradeSettings)
        if (trendData?.error) throw new Error(trendData.error)

        const trendSummary = buildTrendSummaryForAI(trendData)
        const summary = trendData.summary || {}

        // Build film profiles
        let filmProfile = ''
        try {
          const catEntries = []
          for (const film of importedFilms) {
            if (film.catalogueId) {
              const fullEntry = await apiClient.getCatalogueEntry(film.catalogueId)
              if (fullEntry) catEntries.push(fullEntry)
            }
          }
          if (catEntries.length > 0) filmProfile = buildFilmProfileForAI(catEntries)
        } catch (profileErr) {
          console.warn('CineScope: Could not load film profiles for AI', profileErr)
        }

        // Build demographic + political enrichment
        const { demographicSummary, politicalSummary } = await buildEnrichmentForAI(venues)

        // Build placeholder values
        const filmTitles = trendData.filmTitles || importedFilms.map(f => f.filmInfo?.title || 'Untitled')
        const values = {
          film_titles: filmTitles.join(', '),
          film_count: String(filmTitles.length),
          total_venues: String(summary.trackedVenues || 0),
          improving_count: String(summary.improving || 0),
          declining_count: String(summary.declining || 0),
          trend_data: trendSummary,
          film_profiles: filmProfile || '(No film profile data available)',
          demographic_summary: demographicSummary || '(Demographic data not available)',
          political_summary: politicalSummary || '(Political data not available)',
        }

        const userMessage = substituteTemplate(tpl, values)
        await generateReportFromPrompt(
          getToken, SYSTEM_PROMPTS.insights, userMessage,
          (chunk) => { setReportText(prev => prev + chunk) }
        )

      } else if (selectedType === 'chain') {
        // ── Chain performance report ──
        const chainVenues = venues.filter(v => v.chain === selectedChain)
        const chainData = buildChainDataForAI(selectedChain, chainVenues, venues, selectedFilm)

        let filmProfile = ''
        try {
          const catId = selectedFilm?.catalogueId
          if (catId) {
            const entry = await apiClient.getCatalogueEntry(catId)
            if (entry) filmProfile = buildFilmProfileForAI([entry])
          }
        } catch (profileErr) {
          console.warn('CineScope: Could not load film profile for chain report', profileErr)
        }

        // Build demographic + political enrichment for chain venues
        const { demographicSummary, politicalSummary } = await buildEnrichmentForAI(chainVenues)

        const values = {
          chain_name: selectedChain,
          film_title: selectedFilm?.filmInfo?.title || 'Unknown Film',
          chain_data: chainData,
          film_profile: filmProfile || '(No film profile data available)',
          demographic_summary: demographicSummary || '(Demographic data not available)',
          political_summary: politicalSummary || '(Political data not available)',
        }

        const userMessage = substituteTemplate(tpl, values)
        await generateReportFromPrompt(
          getToken, SYSTEM_PROMPTS.chain, userMessage,
          (chunk) => { setReportText(prev => prev + chunk) }
        )

      } else if (selectedType === 'marketing') {
        // ── Marketing Targets (structured JSON) ──
        const bcVenues = venues.filter(v => v.grade === 'B' || v.grade === 'C')
        const gradeAVenues = venues.filter(v => v.grade === 'A')
        const allScreened = venues.filter(v => v.grade && v.grade !== 'E')
        const networkAvg = allScreened.length > 0
          ? Math.round(allScreened.reduce((s, v) => s + (v.revenue || 0), 0) / allScreened.length)
          : 0
        const gradeAAvg = gradeAVenues.length > 0
          ? Math.round(gradeAVenues.reduce((s, v) => s + (v.revenue || 0), 0) / gradeAVenues.length)
          : 0

        // Cap venues sent to Claude — top 50 by revenue (highest potential)
        const MAX_MARKETING_VENUES = 50
        const sortedBC = [...bcVenues].sort((a, b) => (b.revenue || 0) - (a.revenue || 0))
        const venuesToSend = sortedBC.slice(0, MAX_MARKETING_VENUES)
        const wasCapped = bcVenues.length > MAX_MARKETING_VENUES

        // Build venue data text
        const venueLines = venuesToSend.map(v => {
          const parts = [
            `${v.name} (${v.city || 'Unknown'})`,
            `Chain: ${v.chain || 'Independent'}`,
            `Grade: ${v.grade}`,
            `Revenue: £${(v.revenue || 0).toLocaleString()}`,
            `Screens: ${v.screens || '?'}`,
          ]
          if (v.category) parts.push(`Category: ${v.category}`)
          return parts.join(' | ')
        })
        let venueDataText = venueLines.join('\n')
        if (wasCapped) {
          venueDataText += `\n\n(Showing top ${MAX_MARKETING_VENUES} of ${bcVenues.length} B+C venues, sorted by revenue — highest potential first)`
        }

        // Film profile
        let filmProfile = ''
        try {
          const catId = selectedFilm?.catalogueId
          if (catId) {
            const entry = await apiClient.getCatalogueEntry(catId)
            if (entry) filmProfile = buildFilmProfileForAI([entry])
          }
        } catch (profileErr) {
          console.warn('CineScope: Could not load film profile for marketing report', profileErr)
        }

        // Build demographic + political enrichment for B+C venues
        const { demographicSummary, politicalSummary } = await buildEnrichmentForAI(venuesToSend)

        const values = {
          film_title: selectedFilm?.filmInfo?.title || 'Unknown Film',
          bc_count: String(venuesToSend.length),
          grade_b_count: String(venuesToSend.filter(v => v.grade === 'B').length),
          grade_c_count: String(venuesToSend.filter(v => v.grade === 'C').length),
          network_avg: `£${networkAvg.toLocaleString()}`,
          grade_a_avg: `£${gradeAAvg.toLocaleString()}`,
          venue_data: venueDataText,
          film_profile: filmProfile || '(No film profile data available)',
          demographic_summary: demographicSummary || '(Demographic data not available)',
          political_summary: politicalSummary || '(Political data not available)',
        }

        const userMessage = substituteTemplate(tpl, values)
        let fullText = ''
        await generateReportFromPrompt(
          getToken, SYSTEM_PROMPTS.marketing, userMessage,
          (chunk) => {
            fullText += chunk
            setReportText(prev => prev + chunk)
          },
          8192 // Higher token limit for structured JSON output
        )

        // Try to parse as JSON for structured table display
        try {
          const cleaned = fullText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
          const parsed = JSON.parse(cleaned)
          if (parsed && Array.isArray(parsed.venues)) {
            // Add cap note to summary if we truncated
            if (wasCapped && parsed.summary) {
              parsed.summary += ` (Showing top ${MAX_MARKETING_VENUES} of ${bcVenues.length} total B+C venues, ranked by highest revenue.)`
            }
            setMarketingData(parsed)
          }
        } catch (parseErr) {
          console.warn('CineScope: Marketing response was not valid JSON, showing as text', parseErr)
          // Leave reportText visible as fallback
        }

      } else if (selectedType === 'venue_recs') {
        // ── Venue Recommendations (structured JSON) ──
        const MAX_CANDIDATE_VENUES = 60
        const MAX_PERFORMER_VENUES = 30

        // Build film profile from catalogue
        let filmProfile = ''
        try {
          const catId = selectedFilm?.catalogueId
          if (catId) {
            const entry = await apiClient.getCatalogueEntry(catId)
            if (entry) filmProfile = buildFilmProfileForAI([entry])
          }
        } catch (profileErr) {
          console.warn('CineScope: Could not load film profile for venue recs', profileErr)
        }

        let topPerformersText = '(No performance data available for this film)'
        let candidateVenuesText = ''
        let historicalText = '(No historical data from other films)'
        let modeLabel = effectiveRecsMode === 'missed_opportunity'
          ? 'MISSED OPPORTUNITY -- Identify unscreened venues that would likely perform well based on the Grade A/B performers.'
          : 'PRE-RELEASE PREDICTION -- Predict which venues would suit this film based on similar historical films.'

        if (effectiveRecsMode === 'missed_opportunity') {
          // Top performers context (Grade A + B, capped)
          const topVenues = venues
            .filter(v => v.grade === 'A' || v.grade === 'B')
            .sort((a, b) => (b.revenue || 0) - (a.revenue || 0))
            .slice(0, MAX_PERFORMER_VENUES)
          if (topVenues.length > 0) {
            topPerformersText = topVenues.map(v =>
              `${v.name} (${v.city || '?'}) | ${v.chain || 'Independent'} | Grade ${v.grade} | £${(v.revenue || 0).toLocaleString()} | ${v.screens || '?'} screens | ${v.category || ''}`
            ).join('\n')
          }

          // Candidate venues: Grade E (unscreened) from baseVenues not in current film's screened set
          const screenedNames = new Set(venues.filter(v => v.grade && v.grade !== 'E').map(v => v.name))
          const unscreened = baseVenues
            .filter(v => !screenedNames.has(v.name) && v.status !== 'closed')
            .slice(0, MAX_CANDIDATE_VENUES)
          candidateVenuesText = unscreened.map(v =>
            `${v.name} (${v.city || '?'}) | ${v.chain || 'Independent'} | ${v.screens || '?'} screens | ${v.category || ''}`
          ).join('\n')
          if (unscreened.length === 0) {
            candidateVenuesText = '(All venues in the network screened this film)'
          }

        } else {
          // Pre-release: use all baseVenues as candidates, historical data from other films
          const candidates = baseVenues
            .filter(v => v.status !== 'closed')
            .slice(0, MAX_CANDIDATE_VENUES)
          candidateVenuesText = candidates.map(v =>
            `${v.name} (${v.city || '?'}) | ${v.chain || 'Independent'} | ${v.screens || '?'} screens | ${v.category || ''}`
          ).join('\n')
        }

        // Historical data from other imported films
        if (importedFilms.length > 0) {
          const histLines = []
          for (const film of importedFilms) {
            const title = film.filmInfo?.title || 'Untitled'
            const topFilmVenues = (film.revenues || [])
              .sort((a, b) => (b.revenue || 0) - (a.revenue || 0))
              .slice(0, 15)
            if (topFilmVenues.length > 0) {
              histLines.push(`\n--- ${title} (top 15 venues) ---`)
              for (const v of topFilmVenues) {
                histLines.push(`${v.venue_name || v.name || '?'} (${v.venue_city || v.city || '?'}) | £${(v.revenue || 0).toLocaleString()}`)
              }
            }
          }
          if (histLines.length > 0) historicalText = histLines.join('\n')
        }

        // Build demographic + political enrichment for candidate venues
        const enrichmentVenues = effectiveRecsMode === 'missed_opportunity'
          ? baseVenues.filter(v => !new Set(venues.filter(vv => vv.grade && vv.grade !== 'E').map(vv => vv.name)).has(v.name))
          : baseVenues
        const { demographicSummary, politicalSummary } = await buildEnrichmentForAI(enrichmentVenues.slice(0, 60))

        const values = {
          mode: modeLabel,
          film_title: selectedFilm?.filmInfo?.title || 'Unknown Film',
          film_profile: filmProfile || '(No film profile data available)',
          candidate_venues: candidateVenuesText,
          top_performers: topPerformersText,
          historical_data: historicalText,
          demographic_summary: demographicSummary || '(Demographic data not available)',
          political_summary: politicalSummary || '(Political data not available)',
        }

        const userMessage = substituteTemplate(tpl, values)
        let fullText = ''
        await generateReportFromPrompt(
          getToken, SYSTEM_PROMPTS.venue_recs, userMessage,
          (chunk) => {
            fullText += chunk
            setReportText(prev => prev + chunk)
          },
          8192
        )

        // Parse JSON for structured table
        try {
          const cleaned = fullText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
          const parsed = JSON.parse(cleaned)
          if (parsed && Array.isArray(parsed.venues)) {
            setRecsData(parsed)
          }
        } catch (parseErr) {
          console.warn('CineScope: Venue recs response was not valid JSON, showing as text', parseErr)
        }
      }
    } catch (err) {
      console.error('CineScope: Report generation failed', err)
      setError(err.message || 'Report generation failed')
    } finally {
      setLoading(false)
    }
  }, [selectedType, loading, currentTemplate, importedFilms, baseVenues, gradeSettings,
      selectedFilm, selectedChain, venues, getToken, apiClient, effectiveRecsMode])

  const handleCopy = useCallback(() => {
    if (marketingData) {
      const header = 'Rank\tVenue\tCity\tChain\tGrade\tRevenue\tScreens\tPotential\tNote'
      const rows = (marketingData.venues || []).map(v =>
        `${v.rank}\t${v.name}\t${v.city}\t${v.chain}\t${v.grade}\t£${(v.revenue || 0).toLocaleString()}\t${v.screens || ''}\t${v.potential}\t${v.note}`
      )
      navigator.clipboard.writeText([header, ...rows].join('\n'))
    } else if (recsData) {
      const header = 'Rank\tVenue\tCity\tChain\tPredicted Grade\tConfidence\tScreens\tReasoning'
      const rows = (recsData.venues || []).map(v =>
        `${v.rank}\t${v.name}\t${v.city}\t${v.chain}\t${v.predicted_grade}\t${v.confidence}\t${v.screens || ''}\t${v.reasoning}`
      )
      navigator.clipboard.writeText([header, ...rows].join('\n'))
    } else {
      navigator.clipboard.writeText(reportText)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [reportText, marketingData, recsData])

  const handleDownloadCSV = useCallback(() => {
    if (!csvData || csvData.length === 0) return
    const filmTitle = selectedFilm?.filmInfo?.title || 'CineScope Export'
    const headers = ['Venue', 'City', 'Chain', 'Category', 'Screens', 'Revenue', 'Grade', 'National Rank', 'Chain Rank']
    const rows = csvData.map(v => [
      `"${(v.name || '').replace(/"/g, '""')}"`,
      `"${(v.city || '').replace(/"/g, '""')}"`,
      `"${(v.chain || 'Independent').replace(/"/g, '""')}"`,
      `"${(v.category || '').replace(/"/g, '""')}"`,
      v.screens || '',
      v.revenue || 0,
      v.grade || '',
      `${v._nationalRank} of ${csvData.length}`,
      `${v._chainRank} of ${v._chainTotal}`,
    ])
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${filmTitle.replace(/[^a-zA-Z0-9 ]/g, '').trim()}_venues.csv`
    link.click()
    URL.revokeObjectURL(url)
  }, [csvData, selectedFilm])


  // ── Status message for disabled states ──

  function getStatusMessage() {
    if (!hasApiKey && (selectedType === 'insights' || selectedType === 'chain')) {
      return { icon: 'key', text: 'Add your Anthropic API key in Settings to generate AI reports.' }
    }
    if (selectedType === 'insights' && importedFilms.length < 2) {
      const n = importedFilms.length
      return {
        icon: 'movie',
        text: `Import Comscore data for at least 2 films to generate trend insights. Currently ${n} film${n === 1 ? '' : 's'} imported.`,
      }
    }
    if (selectedType === 'chain') {
      if (!selectedFilm) return { icon: 'movie', text: 'Select a film from the header dropdown to generate a chain report.' }
      if (filmChains.length === 0) return { icon: 'storefront', text: 'No chains with screening data for the current film.' }
      if (!selectedChain) return { icon: 'business', text: 'Select a chain below to analyse.' }
    }
    if (selectedType === 'marketing') {
      if (!selectedFilm) return { icon: 'movie', text: 'Select a film from the header dropdown to generate marketing targets.' }
      if (!venues.some(v => v.grade === 'B' || v.grade === 'C')) {
        return { icon: 'campaign', text: 'No Grade B or C venues for the current film. Marketing targets require B+C venues.' }
      }
    }
    if (selectedType === 'venue_recs') {
      if (!selectedFilm && catalogue.length === 0) return { icon: 'movie', text: 'Add a film to the catalogue to generate venue recommendations.' }
      if (effectiveRecsMode === 'missed_opportunity' && !filmHasComscore) {
        return { icon: 'storefront', text: 'No Comscore data for this film. Switch to Pre-release mode, or import data for Missed Opportunity analysis.' }
      }
    }
    if (selectedType === 'csv') {
      if (!selectedFilm) return { icon: 'movie', text: 'Select a film from the header dropdown to export data.' }
      if (!venues.some(v => v.grade && v.grade !== 'E')) {
        return { icon: 'table_chart', text: 'No screening data for this film. Import Comscore data first.' }
      }
    }
    return null
  }

  const statusMsg = getStatusMessage()
  const isComingSoon = currentType.stage === 'coming'
  const hasTemplateEditor = selectedType === 'insights' || selectedType === 'chain' || selectedType === 'marketing' || selectedType === 'venue_recs'
  const showTemplateEditor = showEditor && !isComingSoon && hasTemplateEditor


  // ═══════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════

  return (
    <div className="cs-reports" style={{
      background: theme.body, color: theme.text,
      height: '100%', display: 'flex', flexDirection: 'column',
    }}>

      {/* ── Toolbar ── */}
      <div style={{
        padding: '16px 24px 0',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <h1 style={{
          fontSize: '1.15rem', fontWeight: 700, margin: 0,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <Icon name="assessment" size={22} style={{ color: theme.headerBorder }} />
          Reports
        </h1>
        {selectedType === 'insights' && (
          <FilmSelectorDropdown compact />
        )}
      </div>

      {/* ── Report Type Cards ── */}
      <div style={{
        padding: '16px 24px',
        display: 'flex', gap: 10, overflowX: 'auto', flexShrink: 0,
      }}>
        {REPORT_TYPES.map(rt => {
          const isActive = selectedType === rt.id
          const isLocked = rt.stage === 'coming'
          return (
            <button
              key={rt.id}
              onClick={() => !isLocked && handleTypeChange(rt.id)}
              style={{
                flex: '0 0 auto', minWidth: 160,
                padding: '14px 16px', borderRadius: 10,
                border: `1.5px solid ${isActive ? theme.headerBorder : theme.border}`,
                background: isActive ? `${theme.headerBorder}12` : theme.surface,
                cursor: isLocked ? 'not-allowed' : 'pointer',
                opacity: isLocked ? 0.5 : 1,
                textAlign: 'left', transition: 'all 0.15s ease',
                position: 'relative',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <Icon name={rt.icon} size={18} style={{ color: isActive ? theme.headerBorder : theme.textMuted }} />
                <span style={{ fontWeight: 600, fontSize: '0.82rem', color: isActive ? theme.text : theme.textMuted }}>
                  {rt.label}
                </span>
              </div>
              <div style={{ fontSize: '0.72rem', color: theme.textMuted, lineHeight: 1.4 }}>
                {rt.description}
              </div>
              {isLocked && (
                <span style={{
                  position: 'absolute', top: 8, right: 8,
                  fontSize: '0.6rem', fontWeight: 700,
                  background: `${theme.headerBorder}22`, color: theme.headerBorder,
                  padding: '2px 6px', borderRadius: 4,
                }}>SOON</span>
              )}
            </button>
          )
        })}
      </div>

      {/* ── Controls Bar ── */}
      {!isComingSoon && (
        <div style={{
          padding: '0 24px 12px',
          display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', flexShrink: 0,
        }}>
          {/* Chain selector (chain report only) */}
          {selectedType === 'chain' && (
            <>
              {selectedFilm && (
                <div style={{
                  fontSize: '0.8rem', color: theme.textMuted,
                  display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  <Icon name="movie" size={14} />
                  <span style={{ color: theme.text, fontWeight: 500 }}>
                    {selectedFilm?.filmInfo?.title || 'Unknown Film'}
                  </span>
                </div>
              )}
              {filmChains.length > 0 && (
                <select
                  value={selectedChain}
                  onChange={e => { setSelectedChain(e.target.value); setReportText(''); setError(null) }}
                  style={{
                    padding: '6px 10px', borderRadius: 6,
                    border: `1px solid ${theme.border}`,
                    background: theme.surface, color: theme.text,
                    fontSize: '0.82rem', minWidth: 180, cursor: 'pointer',
                  }}
                >
                  <option value="">Select chain...</option>
                  {filmChains.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              )}
            </>
          )}

          {/* Marketing film label */}
          {selectedType === 'marketing' && selectedFilm && (
            <div style={{
              fontSize: '0.8rem', color: theme.textMuted,
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <Icon name="movie" size={14} />
              <span style={{ color: theme.text, fontWeight: 500 }}>
                {selectedFilm?.filmInfo?.title || 'Unknown Film'}
              </span>
              <span style={{
                fontSize: '0.72rem', color: theme.headerBorder,
                background: `${theme.headerBorder}15`, padding: '2px 8px', borderRadius: 4,
              }}>
                {venues.filter(v => v.grade === 'B' || v.grade === 'C').length} B+C venues
              </span>
            </div>
          )}

          {/* Venue Recs controls */}
          {selectedType === 'venue_recs' && (
            <>
              {selectedFilm && (
                <div style={{
                  fontSize: '0.8rem', color: theme.textMuted,
                  display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  <Icon name="movie" size={14} />
                  <span style={{ color: theme.text, fontWeight: 500 }}>
                    {selectedFilm?.filmInfo?.title || 'Unknown Film'}
                  </span>
                </div>
              )}
              <select
                value={effectiveRecsMode}
                onChange={e => { setRecsMode(e.target.value); setReportText(''); setRecsData(null); setError(null) }}
                disabled={!filmHasComscore && effectiveRecsMode === 'pre_release'}
                style={{
                  padding: '6px 10px', borderRadius: 6,
                  border: `1px solid ${theme.border}`,
                  background: theme.surface, color: theme.text,
                  fontSize: '0.82rem', cursor: 'pointer',
                }}
              >
                <option value="missed_opportunity">Missed Opportunities</option>
                <option value="pre_release">Pre-release Prediction</option>
              </select>
              <span style={{
                fontSize: '0.7rem', color: theme.textMuted, maxWidth: 260,
              }}>
                {effectiveRecsMode === 'missed_opportunity'
                  ? 'Find unscreened venues that would likely perform well'
                  : 'Predict best venues based on film profile + history'
                }
              </span>
            </>
          )}

          {/* CSV film label */}
          {selectedType === 'csv' && selectedFilm && (
            <div style={{
              fontSize: '0.8rem', color: theme.textMuted,
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <Icon name="movie" size={14} />
              <span style={{ color: theme.text, fontWeight: 500 }}>
                {selectedFilm?.filmInfo?.title || 'Unknown Film'}
              </span>
              <span style={{
                fontSize: '0.72rem', color: theme.headerBorder,
                background: `${theme.headerBorder}15`, padding: '2px 8px', borderRadius: 4,
              }}>
                {venues.filter(v => v.grade && v.grade !== 'E').length} venues
              </span>
            </div>
          )}

          {/* Generate button */}
          <button
            onClick={handleGenerate}
            disabled={loading || !canGenerate[selectedType]}
            style={{
              padding: '7px 18px', borderRadius: 7, border: 'none',
              background: (loading || !canGenerate[selectedType]) ? theme.border : theme.headerBorder,
              color: '#fff', fontSize: '0.82rem', fontWeight: 600,
              cursor: (loading || !canGenerate[selectedType]) ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
              opacity: (loading || !canGenerate[selectedType]) ? 0.6 : 1,
              transition: 'all 0.15s ease',
            }}
          >
            {loading
              ? <><Icon name="progress_activity" size={15} /> Generating...</>
              : selectedType === 'csv'
              ? <><Icon name="table_chart" size={15} /> Build Preview</>
              : <><Icon name="auto_awesome" size={15} /> Generate Report</>
            }
          </button>

          {/* CSV Download button */}
          {selectedType === 'csv' && csvData && !loading && (
            <button onClick={handleDownloadCSV} style={{
              padding: '7px 16px', borderRadius: 7, border: 'none',
              background: '#27ae60', color: '#fff',
              fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <Icon name="download" size={15} /> Download CSV
            </button>
          )}

          {/* Copy / Regenerate (when report ready, not CSV) */}
          {selectedType !== 'csv' && (reportText || marketingData || recsData) && !loading && (
            <>
              <button onClick={handleCopy} style={secondaryBtnStyle(theme)}>
                <Icon name={copied ? 'check' : 'content_copy'} size={14} />
                {copied ? 'Copied!' : 'Copy'}
              </button>
              <button onClick={handleGenerate} style={secondaryBtnStyle(theme)}>
                <Icon name="refresh" size={14} /> Regenerate
              </button>
            </>
          )}

          {/* Spacer */}
          <div style={{ flex: 1 }} />

          {/* Template editor toggle */}
          {hasTemplateEditor && (
            <button
              onClick={() => setShowEditor(prev => !prev)}
              style={{
                padding: '6px 12px', borderRadius: 6,
                border: `1px solid ${showEditor ? theme.headerBorder : theme.border}`,
                background: showEditor ? `${theme.headerBorder}14` : 'transparent',
                color: showEditor ? theme.headerBorder : theme.textMuted,
                fontSize: '0.78rem', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 5,
              }}
            >
              <Icon name="edit_note" size={15} />
              {showEditor ? 'Hide Template' : 'Edit Template'}
            </button>
          )}
        </div>
      )}

      {/* ── Template Editor (collapsible) ── */}
      {showTemplateEditor && (
        <ReportTemplateEditor
          reportType={selectedType}
          template={currentTemplate}
          onChange={handleTemplateChange}
          onSave={handleTemplateSave}
          onReset={handleTemplateReset}
          saving={templateSaving}
          isModified={isTemplateModified}
          placeholders={PLACEHOLDER_DEFS[selectedType] || []}
          theme={theme}
        />
      )}

      {/* ── Output Panel ── */}
      <div style={{
        flex: 1, minHeight: 0, overflowY: 'auto',
        padding: '0 24px 24px',
      }}>
        {/* Coming soon placeholder for locked types */}
        {isComingSoon && (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            height: '100%', textAlign: 'center',
          }}>
            <div style={{
              width: 56, height: 56, borderRadius: 12,
              background: `${theme.headerBorder}18`, color: theme.headerBorder,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              marginBottom: 12,
            }}>
              <Icon name={currentType.icon} size={28} />
            </div>
            <h4 style={{ fontWeight: 700, marginBottom: 6 }}>{currentType.label}</h4>
            <p style={{ color: theme.textMuted, fontSize: '0.88rem', maxWidth: 400, lineHeight: 1.5 }}>
              {currentType.description}
            </p>
            <span style={{
              background: `${theme.headerBorder}18`, color: theme.headerBorder,
              fontSize: '0.75rem', padding: '6px 14px', borderRadius: 20,
              fontWeight: 500, marginTop: 4,
            }}>
              Coming Soon
            </span>
          </div>
        )}

        {/* Status / requirement message */}
        {!isComingSoon && !reportText && !loading && !error && !csvData && !marketingData && !recsData && statusMsg && (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            height: '100%', textAlign: 'center',
          }}>
            <div style={{
              width: 48, height: 48, borderRadius: 10,
              background: `${theme.headerBorder}14`, color: theme.headerBorder,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              marginBottom: 12,
            }}>
              <Icon name={statusMsg.icon} size={24} />
            </div>
            <p style={{ color: theme.textMuted, fontSize: '0.88rem', maxWidth: 420, lineHeight: 1.5 }}>
              {statusMsg.text}
            </p>
          </div>
        )}

        {/* Ready to generate prompt */}
        {!isComingSoon && !reportText && !loading && !error && !statusMsg && !csvData && !marketingData && !recsData && (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            height: '100%', textAlign: 'center',
          }}>
            <div style={{
              width: 48, height: 48, borderRadius: 10,
              background: `${theme.headerBorder}14`, color: theme.headerBorder,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              marginBottom: 12,
            }}>
              <Icon name="auto_awesome" size={24} />
            </div>
            <p style={{ color: theme.textMuted, fontSize: '0.88rem', maxWidth: 420, lineHeight: 1.5 }}>
              {selectedType === 'insights'
                ? `Ready to analyse ${importedFilms.length} films. Click "Generate Report" to get AI-powered trend insights.`
                : selectedType === 'marketing'
                ? `Ready to analyse ${venues.filter(v => v.grade === 'B' || v.grade === 'C').length} Grade B+C venues for marketing opportunities.`
                : selectedType === 'venue_recs'
                ? effectiveRecsMode === 'missed_opportunity'
                  ? `Ready to find missed screening opportunities from ${baseVenues.filter(v => v.status !== 'closed').length - venues.filter(v => v.grade && v.grade !== 'E').length} unscreened venues.`
                  : `Ready to predict best venues for this film based on profile and history.`
                : selectedType === 'csv'
                ? `Ready to export ${venues.filter(v => v.grade && v.grade !== 'E').length} venues with revenue and grade data. Click "Build Preview" to see the data.`
                : `Ready to generate ${selectedChain} performance report. Click "Generate Report" to start.`
              }
            </p>
          </div>
        )}

        {/* Error */}
        {!isComingSoon && error && (
          <div style={{
            padding: 16, borderRadius: 8,
            background: '#ef444415', border: '1px solid #ef444440',
            display: 'flex', alignItems: 'flex-start', gap: 10,
          }}>
            <Icon name="error" size={18} style={{ color: '#ef4444', flexShrink: 0, marginTop: 2 }} />
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.85rem', color: '#ef4444', marginBottom: 4 }}>
                Report generation failed
              </div>
              <div style={{ fontSize: '0.82rem', color: theme.textMuted, lineHeight: 1.5 }}>
                {error}
              </div>
            </div>
          </div>
        )}

        {/* CSV Data Preview Table */}
        {!isComingSoon && csvData && csvData.length > 0 && (
          <div style={{
            borderRadius: 10, overflow: 'hidden',
            border: `1px solid ${theme.border}`,
            background: theme.surface,
          }}>
            {/* Header */}
            <div style={{
              padding: '14px 20px',
              borderBottom: `1px solid ${theme.border}`,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.84rem' }}>
                <Icon name="table_chart" size={18} style={{ color: theme.headerBorder }} />
                <span style={{ fontWeight: 600, color: theme.text }}>
                  {selectedFilm?.filmInfo?.title || 'Export'}
                </span>
                <span style={{ color: theme.textMuted }}>
                  — {csvData.length} venues
                </span>
              </div>
              <button onClick={handleDownloadCSV} style={{
                padding: '6px 14px', borderRadius: 6, border: 'none',
                background: '#27ae60', color: '#fff',
                fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 5,
              }}>
                <Icon name="download" size={14} /> Download CSV
              </button>
            </div>

            {/* Table */}
            <div style={{ overflowX: 'auto', maxHeight: 520, overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                <thead>
                  <tr style={{
                    borderBottom: `1px solid ${theme.border}`,
                    background: `${theme.headerBorder}08`,
                    position: 'sticky', top: 0, zIndex: 1,
                  }}>
                    {['Venue', 'City', 'Chain', 'Category', 'Screens', 'Revenue', 'Grade', 'National Rank', 'Chain Rank'].map(h => (
                      <th key={h} style={{
                        padding: '9px 10px', textAlign: 'left',
                        fontWeight: 600, fontSize: '0.7rem',
                        color: theme.textMuted, whiteSpace: 'nowrap',
                        textTransform: 'uppercase', letterSpacing: '0.03em',
                        background: theme.surface,
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {csvData.map((v, i) => {
                    const gradeColors = { A: '#27ae60', B: '#f5c542', C: '#e67e22', D: '#e74c3c' }
                    return (
                      <tr key={i} style={{
                        borderBottom: `1px solid ${theme.border}`,
                        transition: 'background 0.1s',
                      }}
                        onMouseEnter={e => e.currentTarget.style.background = `${theme.headerBorder}06`}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <td style={{ ...cellStyle, fontWeight: 500, color: theme.text, whiteSpace: 'nowrap' }}>{v.name}</td>
                        <td style={cellStyle}>{v.city || ''}</td>
                        <td style={cellStyle}>{v.chain || 'Independent'}</td>
                        <td style={{ ...cellStyle, fontSize: '0.72rem' }}>{v.category || ''}</td>
                        <td style={{ ...cellStyle, textAlign: 'center' }}>{v.screens || '—'}</td>
                        <td style={{ ...cellStyle, fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                          £{(v.revenue || 0).toLocaleString()}
                        </td>
                        <td style={cellStyle}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <span style={{
                              width: 8, height: 8, borderRadius: '50%',
                              background: gradeColors[v.grade] || '#95a5a6',
                            }} />
                            {v.grade}
                          </span>
                        </td>
                        <td style={{ ...cellStyle, fontSize: '0.72rem', whiteSpace: 'nowrap' }}>
                          #{v._nationalRank} of {csvData.length}
                        </td>
                        <td style={{ ...cellStyle, fontSize: '0.72rem', whiteSpace: 'nowrap' }}>
                          #{v._chainRank} of {v._chainTotal}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Footer */}
            <div style={{
              padding: '10px 20px',
              borderTop: `1px solid ${theme.border}`,
              fontSize: '0.72rem', color: theme.textMuted,
              display: 'flex', justifyContent: 'space-between',
            }}>
              <span>{csvData.length} venues · sorted by revenue (highest first)</span>
              <span>Click "Download CSV" to save as spreadsheet</span>
            </div>
          </div>
        )}

        {/* Marketing Targets Table (structured output) */}
        {!isComingSoon && marketingData && !loading && (
          <div style={{
            borderRadius: 10, overflow: 'hidden',
            border: `1px solid ${theme.border}`,
            background: theme.surface,
          }}>
            {/* Summary */}
            {marketingData.summary && (
              <div style={{
                padding: '14px 20px',
                borderBottom: `1px solid ${theme.border}`,
                fontSize: '0.84rem', lineHeight: 1.6,
                color: theme.text,
                display: 'flex', alignItems: 'flex-start', gap: 10,
              }}>
                <Icon name="campaign" size={18} style={{ color: theme.headerBorder, flexShrink: 0, marginTop: 2 }} />
                <div>{marketingData.summary}</div>
              </div>
            )}

            {/* Table */}
            <div style={{ overflowX: 'auto' }}>
              <table style={{
                width: '100%', borderCollapse: 'collapse',
                fontSize: '0.8rem',
              }}>
                <thead>
                  <tr style={{
                    borderBottom: `1px solid ${theme.border}`,
                    background: `${theme.headerBorder}08`,
                  }}>
                    {['#', 'Venue', 'City', 'Chain', 'Grade', 'Revenue', 'Screens', 'Potential', 'Marketing Note'].map(h => (
                      <th key={h} style={{
                        padding: '10px 12px', textAlign: 'left',
                        fontWeight: 600, fontSize: '0.72rem',
                        color: theme.textMuted, whiteSpace: 'nowrap',
                        textTransform: 'uppercase', letterSpacing: '0.03em',
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(marketingData.venues || []).map((v, i) => (
                    <tr key={i} style={{
                      borderBottom: `1px solid ${theme.border}`,
                      transition: 'background 0.1s',
                    }}
                      onMouseEnter={e => e.currentTarget.style.background = `${theme.headerBorder}08`}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <td style={cellStyle}>{v.rank || i + 1}</td>
                      <td style={{ ...cellStyle, fontWeight: 600, color: theme.text }}>{v.name}</td>
                      <td style={cellStyle}>{v.city}</td>
                      <td style={cellStyle}>{v.chain}</td>
                      <td style={cellStyle}>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                        }}>
                          <span style={{
                            width: 8, height: 8, borderRadius: '50%',
                            background: v.grade === 'B' ? '#f5c542' : '#e67e22',
                          }} />
                          {v.grade}
                        </span>
                      </td>
                      <td style={{ ...cellStyle, fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                        £{(v.revenue || 0).toLocaleString()}
                      </td>
                      <td style={{ ...cellStyle, textAlign: 'center' }}>{v.screens || '—'}</td>
                      <td style={cellStyle}>
                        <span style={{
                          padding: '2px 8px', borderRadius: 4,
                          fontSize: '0.7rem', fontWeight: 600,
                          background: v.potential === 'High' ? '#27ae6020' : v.potential === 'Medium' ? '#f5c54220' : '#95a5a620',
                          color: v.potential === 'High' ? '#27ae60' : v.potential === 'Medium' ? '#f5c542' : '#95a5a6',
                        }}>
                          {v.potential}
                        </span>
                      </td>
                      <td style={{ ...cellStyle, fontSize: '0.76rem', lineHeight: 1.45, maxWidth: 320 }}>
                        {v.note}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Table footer */}
            <div style={{
              padding: '10px 20px',
              borderTop: `1px solid ${theme.border}`,
              fontSize: '0.72rem', color: theme.textMuted,
              display: 'flex', justifyContent: 'space-between',
            }}>
              <span>{marketingData.venues?.length || 0} marketing target venues</span>
              <span>{selectedFilm?.filmInfo?.title}</span>
            </div>
          </div>
        )}

        {/* Venue Recommendations Table (structured output) */}
        {!isComingSoon && recsData && !loading && (
          <div style={{
            borderRadius: 10, overflow: 'hidden',
            border: `1px solid ${theme.border}`,
            background: theme.surface,
          }}>
            {/* Summary */}
            {recsData.summary && (
              <div style={{
                padding: '14px 20px',
                borderBottom: `1px solid ${theme.border}`,
                fontSize: '0.84rem', lineHeight: 1.6,
                color: theme.text,
                display: 'flex', alignItems: 'flex-start', gap: 10,
              }}>
                <Icon name="recommend" size={18} style={{ color: theme.headerBorder, flexShrink: 0, marginTop: 2 }} />
                <div>
                  <div>{recsData.summary}</div>
                  <span style={{
                    display: 'inline-block', marginTop: 6,
                    fontSize: '0.7rem', fontWeight: 600,
                    background: effectiveRecsMode === 'missed_opportunity' ? '#e67e2220' : '#3b82f620',
                    color: effectiveRecsMode === 'missed_opportunity' ? '#e67e22' : '#3b82f6',
                    padding: '2px 8px', borderRadius: 4,
                  }}>
                    {effectiveRecsMode === 'missed_opportunity' ? 'Missed Opportunities' : 'Pre-release Prediction'}
                  </span>
                </div>
              </div>
            )}

            {/* Table */}
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                <thead>
                  <tr style={{
                    borderBottom: `1px solid ${theme.border}`,
                    background: `${theme.headerBorder}08`,
                  }}>
                    {['#', 'Venue', 'City', 'Chain', 'Predicted Grade', 'Confidence', 'Screens', 'Reasoning'].map(h => (
                      <th key={h} style={{
                        padding: '10px 12px', textAlign: 'left',
                        fontWeight: 600, fontSize: '0.72rem',
                        color: theme.textMuted, whiteSpace: 'nowrap',
                        textTransform: 'uppercase', letterSpacing: '0.03em',
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(recsData.venues || []).map((v, i) => {
                    const gradeColor = { A: '#27ae60', B: '#f5c542', C: '#e67e22' }
                    const confColor = { High: '#27ae60', Medium: '#f5c542', Low: '#95a5a6' }
                    return (
                      <tr key={i} style={{
                        borderBottom: `1px solid ${theme.border}`,
                        transition: 'background 0.1s',
                      }}
                        onMouseEnter={e => e.currentTarget.style.background = `${theme.headerBorder}08`}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <td style={cellStyle}>{v.rank || i + 1}</td>
                        <td style={{ ...cellStyle, fontWeight: 600, color: theme.text }}>{v.name}</td>
                        <td style={cellStyle}>{v.city}</td>
                        <td style={cellStyle}>{v.chain}</td>
                        <td style={cellStyle}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <span style={{
                              width: 8, height: 8, borderRadius: '50%',
                              background: gradeColor[v.predicted_grade] || '#95a5a6',
                            }} />
                            {v.predicted_grade}
                          </span>
                        </td>
                        <td style={cellStyle}>
                          <span style={{
                            padding: '2px 8px', borderRadius: 4,
                            fontSize: '0.7rem', fontWeight: 600,
                            background: (confColor[v.confidence] || '#95a5a6') + '20',
                            color: confColor[v.confidence] || '#95a5a6',
                          }}>
                            {v.confidence}
                          </span>
                        </td>
                        <td style={{ ...cellStyle, textAlign: 'center' }}>{v.screens || '—'}</td>
                        <td style={{ ...cellStyle, fontSize: '0.76rem', lineHeight: 1.45, maxWidth: 340 }}>
                          {v.reasoning}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Table footer */}
            <div style={{
              padding: '10px 20px',
              borderTop: `1px solid ${theme.border}`,
              fontSize: '0.72rem', color: theme.textMuted,
              display: 'flex', justifyContent: 'space-between',
            }}>
              <span>{recsData.venues?.length || 0} recommended venues</span>
              <span>{selectedFilm?.filmInfo?.title}</span>
            </div>
          </div>
        )}

        {/* Streaming / completed report (text output) */}
        {!isComingSoon && !marketingData && !recsData && !csvData && (reportText || loading) && (
          <div style={{
            padding: 20, borderRadius: 10,
            background: theme.surface,
            border: `1px solid ${theme.border}`,
            fontSize: '0.86rem', lineHeight: 1.7,
            whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          }}>
            {/* Report header badge */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              marginBottom: 14, paddingBottom: 12,
              borderBottom: `1px solid ${theme.border}`,
              fontSize: '0.78rem', color: theme.textMuted,
            }}>
              <Icon name={currentType.icon} size={16} style={{ color: theme.headerBorder }} />
              <span style={{ fontWeight: 600 }}>{currentType.label}</span>
              {selectedType === 'chain' && selectedChain && (
                <><span style={{ opacity: 0.4 }}>|</span><span>{selectedChain}</span></>
              )}
              {selectedType === 'chain' && selectedFilm && (
                <><span style={{ opacity: 0.4 }}>|</span><span>{selectedFilm?.filmInfo?.title}</span></>
              )}
              {selectedType === 'insights' && (
                <><span style={{ opacity: 0.4 }}>|</span><span>{importedFilms.length} films</span></>
              )}
              {selectedType === 'marketing' && selectedFilm && (
                <><span style={{ opacity: 0.4 }}>|</span><span>{selectedFilm?.filmInfo?.title}</span></>
              )}
              {selectedType === 'venue_recs' && selectedFilm && (
                <>
                  <span style={{ opacity: 0.4 }}>|</span>
                  <span>{selectedFilm?.filmInfo?.title}</span>
                  <span style={{ opacity: 0.4 }}>|</span>
                  <span>{effectiveRecsMode === 'missed_opportunity' ? 'Missed Opportunities' : 'Pre-release'}</span>
                </>
              )}
              {loading && (
                <span style={{ marginLeft: 'auto', color: theme.headerBorder, fontSize: '0.72rem' }}>
                  <Icon name="progress_activity" size={12} /> Streaming...
                </span>
              )}
            </div>

            {/* Report text */}
            {reportText}

            {/* Loading cursor */}
            {loading && !reportText && (
              <div style={{ color: theme.textMuted, textAlign: 'center', padding: 20 }}>
                <Icon name="progress_activity" size={20} />
                <div style={{ marginTop: 8, fontSize: '0.82rem' }}>
                  Generating {currentType.label.toLowerCase()}...
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Footer ── */}
      <div style={{
        padding: '10px 24px',
        borderTop: `1px solid ${theme.border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0,
        fontSize: '0.75rem', color: theme.textMuted,
      }}>
        <span>
          {selectedType === 'insights' && `${importedFilms.length} films in analysis set`}
          {selectedType === 'chain' && selectedFilm && `${filmChains.length} chains available`}
          {selectedType === 'chain' && !selectedFilm && 'No film selected'}
          {selectedType === 'marketing' && selectedFilm && `${venues.filter(v => v.grade === 'B' || v.grade === 'C').length} Grade B+C target venues`}
          {selectedType === 'marketing' && !selectedFilm && 'No film selected'}
          {selectedType === 'venue_recs' && selectedFilm && `${effectiveRecsMode === 'missed_opportunity' ? 'Missed opportunity' : 'Pre-release'} mode`}
          {selectedType === 'venue_recs' && !selectedFilm && 'No film selected'}
          {selectedType === 'csv' && selectedFilm && `${venues.filter(v => v.grade && v.grade !== 'E').length} venues with screening data`}
          {selectedType === 'csv' && !selectedFilm && 'No film selected'}
          {isComingSoon && currentType.requires}
        </span>
        {selectedType !== 'csv' && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Icon name="auto_awesome" size={12} />
            Powered by Claude
          </span>
        )}
        {selectedType === 'csv' && (
          <span>Data export — no AI</span>
        )}
      </div>
    </div>
  )
}


// ── Shared style helpers ──

const cellStyle = {
  padding: '10px 12px',
  verticalAlign: 'top',
}

function secondaryBtnStyle(theme) {
  return {
    padding: '7px 14px', borderRadius: 7,
    border: `1px solid ${theme.border}`,
    background: theme.surface,
    color: theme.textMuted,
    fontSize: '0.8rem', cursor: 'pointer',
    display: 'flex', alignItems: 'center', gap: 5,
  }
}
