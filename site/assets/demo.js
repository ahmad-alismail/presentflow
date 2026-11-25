// PresentFlow website demo: a speaker talks (left), the PresentFlow window follows (right).
// A scripted replay: no microphone and no speech recognition run on this page. Every window state below is what
// the app's real Tracker (src/core/tracking/tracker.ts, semantic mode) produced when these exact phrases were
// replayed against the full talk, and the memory cues come from the app's extractKeywords (src/core/text/cues.ts).
// The window is drawn like the app's Stage and Navigator components.
;(function () {
  'use strict'
  var root = document.querySelector('[data-demo]')
  if (!root) return

  // ── The talk ─────────────────────────────────────────────
  var SLIDES = [
    { title: 'Slide 1 — Opening', sections: ['welcome', 'stand'] },
    { title: 'Slide 2 — Experiments', sections: ['test', 'compete'] },
    { title: 'Slide 3 — Why it matters', sections: ['why', 'counter'] },
    { title: 'Slide 4 — Closing', sections: ['wrap'] }
  ]
  var SECTIONS = {
    welcome: 'Welcome',
    stand: 'Where we stand',
    test: 'Test environment',
    compete: 'Competition',
    why: 'Why this matters',
    counter: 'Countermeasures',
    wrap: 'Wrap-up'
  }
  // [id, section, sentence, memory cue]
  var TALK = [
    ['w1', 'welcome', 'Good morning, and welcome to my talk on the safety of AI agents.', 'Good morning welcome AI'],
    ['w2', 'welcome', 'Today I want to show you why this topic is so urgent right now.', 'Today want topic urgent'],
    ['w3', 'welcome', 'By the end you will know three concrete risks and three countermeasures.', 'three concrete risks countermeasures'],
    ['s1', 'stand', 'AI agents no longer answer single questions, they run whole chains of tasks.', 'answer single whole chains'],
    ['s2', 'stand', 'They write code, book appointments and control other programs.', 'write appointments control programs'],
    ['s3', 'stand', 'So they act more and more on their own, without direct oversight.', 'act without direct oversight'],
    ['t1', 'test', 'For our study we built a closed test environment.', 'study built closed environment'],
    ['t2', 'test', 'Twelve different agents received realistic office tasks.', 'Twelve different received realistic'],
    ['t3', 'test', 'Each agent had access to files, email and a command line.', 'access files email command'],
    ['c1', 'compete', 'In a second scenario, several agents had to compete for limited computing time.', 'scenario several compete computing'],
    ['c2', 'compete', 'Some agents started hoarding resources even though that was not their task.', 'started hoarding resources though'],
    ['m1', 'why', 'This matters because many AI agents will soon work on complex tasks for long periods.', 'matters AI complex periods'],
    ['m2', 'why', 'Small wrong incentives can grow over many steps.', 'Small wrong incentives steps'],
    ['m3', 'why', 'When nobody is watching, such deviations show up late.', 'nobody watching such deviations'],
    ['k1', 'counter', 'First, agents should only get the permissions their task really needs.', 'First get permissions really'],
    ['k2', 'counter', 'Second, we need independent logs that make every action traceable.', 'independent every action traceable'],
    ['k3', 'counter', 'Third, a human must be able to stop an agent reliably at any time.', 'Third human able reliably'],
    ['e1', 'wrap', 'That brings me to the end of my talk.', 'brings end talk'],
    ['e2', 'wrap', 'Agents are getting more powerful, but we can measure and improve their safety.', 'getting powerful measure improve'],
    ['e3', 'wrap', 'I look forward to your questions.', 'look forward questions']
  ]
  var LINE = {}
  TALK.forEach(function (r, i) {
    LINE[r[0]] = { id: r[0], sec: r[1], text: r[2], cue: r[3].split(' '), at: i }
  })

  // Tracker output after each phrase: said = covered, skipped = passed over without being said.
  var STATES = {
    start: { active: 'welcome', current: 'w1', upcoming: ['w2', 'w3'], said: [], skipped: [] },
    follow: { active: 'welcome', current: 'w2', upcoming: ['w3', 's1'], said: ['w1'], skipped: [] },
    skip: { active: 'welcome', current: 's1', upcoming: ['s2', 's3'], said: ['w1', 'w3'], skipped: ['w2'] },
    paraphrase: { active: 'stand', current: 's2', upcoming: ['s3', 't1'], said: ['w1', 'w3', 's1'], skipped: ['w2'] },
    jump: { active: 'why', current: 'm3', upcoming: ['k1', 'k2'], said: ['w1', 'w3', 's1', 'm1', 'm2'], skipped: ['w2'] }
  }

  var SHARED = ['ai', 'agents', 'answer', 'question', 'questions', 'whole', 'chains', 'tasks']
  // Each step: what the speaker says, the window state that follows, the line(s) it matched, and two captions:
  // the setup while the speaker talks and the result once PresentFlow has answered.
  var BEATS = [
    {
      title: 'Follows along',
      steps: [
        {
          say: LINE.w1.text,
          state: 'follow',
          matched: ['w1'],
          marks: [['w1']],
          setup: 'The speaker starts with the first sentence.',
          result: 'Matched. It moves up, and the next sentence is ready.'
        }
      ]
    },
    {
      title: 'Skips a sentence',
      steps: [
        {
          say: LINE.w3.text,
          state: 'skip',
          matched: ['w3'],
          marks: [['w3'], ['w2', 'warn']],
          tone: 'warn',
          setup: 'The speaker leaves out “Today I want to show you…” and goes on.',
          result: 'PresentFlow follows. The left-out sentence is marked amber and kept for later.'
        }
      ]
    },
    {
      title: 'Paraphrases',
      steps: [
        {
          say: "AI agents don't just answer one question anymore, they handle whole chains of tasks.",
          shared: SHARED,
          state: 'paraphrase',
          matched: ['s1'],
          marks: [['s1']],
          setup: 'The speaker says the next sentence in their own words.',
          result: 'Different words, same sentence: it still matches.'
        }
      ]
    },
    {
      title: 'Jumps ahead',
      steps: [
        {
          say: LINE.m1.text,
          state: 'paraphrase',
          hold: 2800,
          tone: 'wait',
          setup: 'The speaker jumps ahead to a sentence from slide 3.',
          result: 'Not on screen. PresentFlow waits for one more sentence before it moves.'
        },
        {
          say: LINE.m2.text,
          state: 'jump',
          marks: [['m1'], ['m2']],
          setup: 'The speaker keeps going on slide 3.',
          result: 'Two sentences from slide 3: PresentFlow jumps there.'
        }
      ]
    }
  ]

  var WORD_MS = 270 // a time-lapse of speech
  var PROCESS_MS = 900 // the app answers about a second after a phrase (local Whisper: 0.7–1.4 s)
  var HOLD_MS = 3800 // time to read the result
  var LEAD_MS = 600
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches

  // ── Elements ─────────────────────────────────────────────
  var $ = function (sel) {
    return root.querySelector(sel)
  }
  var ui = {
    wave: $('[data-wave]'),
    said: $('[data-said]'),
    caption: $('[data-caption]'),
    where: $('[data-where]'),
    stage: $('[data-stage]'),
    points: $('[data-points]'),
    slides: $('[data-slides]'),
    play: $('[data-play]'),
    beats: $('[data-beats]'),
    announce: $('[data-announce]')
  }

  function node(tag, cls, text) {
    var n = document.createElement(tag)
    if (cls) n.className = cls
    if (text != null) n.textContent = text
    return n
  }
  var ICONS = {
    done: '<path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
    active: '<circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="8" cy="8" r="3" fill="currentColor"/>',
    partial: '<circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M8 2a6 6 0 0 1 0 12z" fill="currentColor"/>',
    open: '<circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.6"/>'
  }
  function icon(state) {
    var s = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    s.setAttribute('class', 'state-icon ' + state)
    s.setAttribute('viewBox', '0 0 16 16')
    s.setAttribute('aria-hidden', 'true')
    s.innerHTML = ICONS[state]
    return s
  }
  function bare(word) {
    return word.replace(/[^\p{L}\p{N}'-]/gu, '').toLowerCase()
  }
  /** Appends `text`; the words in `list` (lower case) go in <b>, or in a span of class `cls`. */
  function words(parent, text, list, cls) {
    text.split(/(\s+)/).forEach(function (part) {
      var m = list && part.match(/^(.*?)([\p{L}\p{N}'-]+)(.*)$/u)
      if (m && list.indexOf(m[2].toLowerCase()) >= 0) {
        parent.appendChild(document.createTextNode(m[1]))
        parent.appendChild(node(cls ? 'span' : 'b', cls || null, m[2]))
        parent.appendChild(document.createTextNode(m[3]))
      } else {
        parent.appendChild(document.createTextNode(part))
      }
    })
  }
  function lower(list) {
    return list.map(function (w) {
      return w.toLowerCase()
    })
  }

  // ── The PresentFlow window (mirrors Stage.tsx and Navigator.tsx) ──
  function slideOf(sec) {
    for (var i = 0; i < SLIDES.length; i++) if (SLIDES[i].sections.indexOf(sec) >= 0) return i
    return -1
  }
  /** "Section", or "Slide · Section" when it lies on another slide than the active section. */
  function where(id, st) {
    var sec = LINE[id].sec
    var s = slideOf(sec)
    return s === slideOf(st.active) ? SECTIONS[sec] : SLIDES[s].title + ' · ' + SECTIONS[sec]
  }
  function linesOf(sec) {
    return TALK.filter(function (r) {
      return r[1] === sec
    }).map(function (r) {
      return r[0]
    })
  }
  function has(list, id) {
    return list.indexOf(id) >= 0
  }
  function sectionStatus(st, sec) {
    var ids = linesOf(sec)
    var said = ids.filter(function (id) {
      return has(st.said, id)
    }).length
    return said === ids.length ? 'done' : said ? 'partial' : 'open'
  }
  function hasSkipped(st, sec) {
    return linesOf(sec).some(function (id) {
      return has(st.skipped, id)
    })
  }

  function renderStage(st, highlight) {
    var cur = LINE[st.current]
    var past = []
    for (var k = cur.at - 1; k >= 0 && past.length < 3; k--) past.unshift(TALK[k][0])

    var pastBox = node('div', 'past')
    past.forEach(function (id, i) {
      var p = node('p', 'line' + (i === past.length - 1 ? ' newest' : '') + (has(st.skipped, id) ? ' skipped' : ''))
      p.dataset.id = id
      if (i > 0 && LINE[id].sec !== LINE[past[i - 1]].sec) p.appendChild(node('span', 'cont', where(id, st)))
      words(p, LINE[id].text, highlight && highlight.id === id ? highlight.words : null, 'hit')
      if (has(st.skipped, id)) p.appendChild(node('span', 'sr-only', ' (skipped)'))
      pastBox.appendChild(p)
    })
    var continuation = cur.sec !== st.active
    var last = past.length ? LINE[past[past.length - 1]] : null
    if (continuation || !last || last.sec !== cur.sec) {
      pastBox.appendChild(node('div', 'tag' + (continuation ? ' cont' : ''), continuation ? '→ ' + where(cur.id, st) : SECTIONS[cur.sec]))
    }

    var current = node('p', 'current')
    current.dataset.id = cur.id
    words(current, cur.text, lower(cur.cue))

    var upcoming = node('div', 'upcoming')
    st.upcoming.forEach(function (id, i) {
      var p = node('p', 'item' + (i === 1 ? ' second' : ''))
      p.dataset.id = id
      var prev = i === 0 ? cur.sec : LINE[st.upcoming[i - 1]].sec
      if (LINE[id].sec !== prev) p.appendChild(node('span', 'cont', '→ ' + where(id, st)))
      p.appendChild(document.createTextNode(LINE[id].text))
      upcoming.appendChild(p)
    })
    ui.stage.replaceChildren(pastBox, current, upcoming)
  }

  function renderNav(st) {
    var points = [node('h3', null, SECTIONS[st.active])]
    linesOf(st.active).forEach(function (id) {
      var state = has(st.said, id) ? 'said' : id === st.current ? 'current' : has(st.skipped, id) ? 'skipped' : 'open'
      var row = node('div', 'point ' + state)
      row.dataset.id = id
      row.appendChild(icon(state === 'said' ? 'done' : state === 'current' ? 'active' : 'open'))
      row.appendChild(node('span', null, LINE[id].cue.join(' → ')))
      if (state === 'skipped') row.appendChild(node('span', 'sr-only', ' (skipped)'))
      points.push(row)
    })
    ui.points.replaceChildren.apply(ui.points, points)

    var slides = [node('h3', null, 'Slides')]
    SLIDES.forEach(function (slide) {
      var statuses = slide.sections.map(function (sec) {
        return sectionStatus(st, sec)
      })
      var active = has(slide.sections, st.active)
      var state = active
        ? 'active'
        : statuses.every(function (s) {
              return s === 'done'
            })
          ? 'done'
          : statuses.some(function (s) {
                return s !== 'open'
              })
            ? 'partial'
            : 'open'
      var row = node('div', 'row slide' + (active ? ' current' : ''))
      row.appendChild(icon(state))
      row.appendChild(node('span', 't', slide.title))
      if (!active && slide.sections.some(hasSkipped.bind(null, st))) row.appendChild(node('span', 'skip-dot'))
      slides.push(row)
      if (!active) return
      slide.sections.forEach(function (sec, i) {
        var isActive = sec === st.active
        var sub = node('div', 'row nested' + (isActive ? ' active' : ''))
        sub.dataset.sec = sec
        sub.appendChild(icon(isActive ? 'active' : statuses[i]))
        sub.appendChild(node('span', 't', SECTIONS[sec]))
        if (hasSkipped(st, sec)) sub.appendChild(node('span', 'skip-dot'))
        slides.push(sub)
      })
    })
    ui.slides.replaceChildren.apply(ui.slides, slides)

    var slide = SLIDES[slideOf(st.active)]
    ui.where.replaceChildren(document.createTextNode(slide.title + ' · '), node('b', null, SECTIONS[st.active]))
  }

  var shown = null // key of the state on screen
  function show(key, opts) {
    opts = opts || {}
    var moved = shown !== null && shown !== key
    if (shown === key && !opts.highlight && !opts.force) return
    shown = key
    renderStage(STATES[key], opts.highlight)
    renderNav(STATES[key])
    root.classList.toggle('moved', moved && !opts.instant)
  }
  /** Tints lines and talking points until the next render: blue for matched, amber for skipped. */
  function mark(list) {
    ;(list || []).forEach(function (m) {
      root.querySelectorAll('[data-id="' + m[0] + '"]').forEach(function (n) {
        n.classList.add('mark')
        if (m[1] === 'warn') n.classList.add('warn')
      })
    })
  }

  // ── The speaker ──────────────────────────────────────────
  var HEIGHTS = [0.35, 0.6, 0.9, 0.55, 0.75, 1, 0.45, 0.7, 0.95, 0.5, 0.8, 0.4, 0.65, 0.9, 0.55, 0.3, 0.7, 0.85, 0.5, 0.6, 0.95, 0.4, 0.75, 0.5]
  HEIGHTS.forEach(function (h, i) {
    var bar = node('i')
    bar.style.setProperty('--h', h)
    bar.style.setProperty('--i', i)
    ui.wave.appendChild(bar)
  })
  function speak(step, count) {
    var list = step.say.split(' ')
    var frag = document.createDocumentFragment()
    list.slice(0, count).forEach(function (w, i) {
      if (i) frag.appendChild(document.createTextNode(' '))
      frag.appendChild(node('span', null, w))
    })
    ui.said.replaceChildren(frag)
    ui.said.classList.remove('stale')
  }
  /** After a paraphrase: the words it shares with the script sentence stand out, the rest steps back. */
  function showShared(step) {
    ui.said.querySelectorAll('span').forEach(function (s) {
      s.className = has(step.shared, bare(s.textContent)) ? 'hit' : 'miss'
    })
  }
  function setCaption(text, tone) {
    ui.caption.textContent = text
    ui.caption.dataset.tone = tone || ''
    ui.caption.classList.remove('fresh')
    void ui.caption.offsetWidth // restart the entrance animation
    ui.caption.classList.add('fresh')
  }
  /** The whole beat in words, for the screen-reader announcement. */
  function story(beat) {
    return (
      beat.title +
      '. ' +
      beat.steps
        .map(function (s) {
          return s.setup + ' ' + s.result
        })
        .join(' ')
    )
  }

  // ── Controls ─────────────────────────────────────────────
  var chips = BEATS.map(function (beat, i) {
    var b = node('button', 'beat')
    b.type = 'button'
    b.appendChild(node('span', 'n', String(i + 1)))
    b.appendChild(document.createTextNode(beat.title))
    b.appendChild(node('span', 'bar'))
    b.addEventListener('click', function () {
      choose(i)
    })
    ui.beats.appendChild(b)
    return b
  })
  /** Story-style progress: earlier beats full, the current one filling, later ones empty. */
  function select(i, p) {
    chips.forEach(function (c, k) {
      c.style.setProperty('--p', k < i ? 1 : k === i ? p : 0)
      if (k === i) c.setAttribute('aria-current', 'step')
      else c.removeAttribute('aria-current')
    })
  }
  function fill(i, p) {
    chips[i].style.setProperty('--p', Math.min(1, p))
  }

  // ── Playback: one cursor, one timer ──────────────────────
  var cur = null // { beat, step, phase, word, elapsed }
  var timer = null
  var pending = null // { fn, due, ms }
  var raf = 0
  var playing = false
  var single = false // play one chosen beat, then stop
  var userPaused = false
  var started = false

  function duration(beat) {
    return (
      LEAD_MS +
      beat.steps.reduce(function (sum, s) {
        return sum + s.say.split(' ').length * WORD_MS + PROCESS_MS + (s.hold || HOLD_MS)
      }, 0)
    )
  }
  function later(fn, ms) {
    clearTimeout(timer)
    pending = { fn: fn, due: performance.now() + ms, ms: ms }
    timer = setTimeout(function () {
      cur.elapsed += pending.ms
      pending = null
      fn()
    }, ms)
  }
  function halt() {
    clearTimeout(timer)
    timer = null
    if (pending && cur) {
      var left = Math.max(0, pending.due - performance.now())
      cur.elapsed += pending.ms - left
      pending.ms = left
    }
  }
  function frame() {
    raf = 0
    if (!playing || !cur) return
    var p = cur.elapsed + (pending ? pending.ms - Math.max(0, pending.due - performance.now()) : 0)
    fill(cur.beat, p / duration(BEATS[cur.beat]))
    raf = requestAnimationFrame(frame)
  }
  function setPhase(phase) {
    cur.phase = phase
    root.dataset.phase = phase
  }
  function setPlaying(on) {
    playing = on
    root.dataset.playing = String(on)
    ui.play.setAttribute('aria-label', on ? 'Pause demo' : 'Play demo')
    if (on && !raf) raf = requestAnimationFrame(frame)
  }
  function stepOf() {
    return BEATS[cur.beat].steps[cur.step]
  }
  function startOf(i) {
    if (i === 0) return 'start'
    var steps = BEATS[i - 1].steps
    return steps[steps.length - 1].state
  }

  function beginBeat(i) {
    halt()
    pending = null
    cur = { beat: i, step: 0, phase: 'speaking', word: 0, elapsed: 0 }
    root.dataset.beat = String(i)
    select(i, 0)
    show(startOf(i), { instant: true, force: true })
    ui.said.classList.add('stale') // the last phrase fades until the next one starts
    setCaption(BEATS[i].steps[0].setup, '')
    setPhase('settled')
    later(beginStep, LEAD_MS)
  }
  function beginStep() {
    cur.word = 0
    ui.said.classList.add('stale')
    if (ui.caption.textContent !== stepOf().setup) setCaption(stepOf().setup, '')
    setPhase('speaking')
    later(tick, WORD_MS)
  }
  function tick() {
    var step = stepOf()
    if (cur.phase === 'speaking') {
      speak(step, ++cur.word)
      if (cur.word < step.say.split(' ').length) return later(tick, WORD_MS)
      setPhase('processing')
      mark(
        (step.matched || []).map(function (id) {
          return [id]
        })
      )
      return later(tick, PROCESS_MS)
    }
    if (cur.phase === 'processing') {
      settle(step)
      return later(tick, step.hold || HOLD_MS)
    }
    // settled: next step, next beat, or stop after a chosen beat
    if (cur.step + 1 < BEATS[cur.beat].steps.length) {
      cur.step++
      return beginStep()
    }
    if (single) return finish()
    beginBeat((cur.beat + 1) % BEATS.length)
  }
  function settle(step) {
    show(step.state, step.shared ? { highlight: { id: 's1', words: step.shared } } : null)
    if (step.shared) showShared(step)
    setCaption(step.result, step.tone || 'ok')
    setPhase('settled')
    mark(step.marks)
  }
  function finish() {
    halt()
    pending = null
    fill(cur.beat, 1)
    setPlaying(false)
    ui.announce.textContent = story(BEATS[cur.beat])
  }

  /** A beat's end state at once: the resting state, and every chip click with reduced motion. */
  function showEnd(i) {
    halt()
    pending = null
    var steps = BEATS[i].steps
    var step = steps[steps.length - 1]
    cur = { beat: i, step: steps.length - 1, phase: 'settled', word: 0, elapsed: 0 }
    root.dataset.beat = String(i)
    show(startOf(i), { instant: true, force: true })
    speak(step, Infinity)
    settle(step)
    root.classList.remove('moved')
    select(i, 1)
  }

  function choose(i) {
    userPaused = false
    started = true
    single = true
    if (reduceMotion) {
      setPlaying(false)
      showEnd(i)
      ui.announce.textContent = story(BEATS[i])
      return
    }
    setPlaying(true)
    beginBeat(i)
  }
  function play() {
    single = false
    setPlaying(true)
    if (pending) return later(pending.fn, pending.ms) // resume mid-beat
    beginBeat(started ? (cur.beat + 1) % BEATS.length : 0) // from the resting state: from the top
    started = true
  }
  function pause() {
    halt()
    setPlaying(false)
  }

  ui.play.addEventListener('click', function () {
    if (playing) {
      userPaused = true
      pause()
    } else {
      userPaused = false
      play()
    }
  })

  // Resting state: the end of the first beat, so the still frame already makes sense.
  showEnd(0)

  // Autoplay while a good part of the demo is on screen (never with reduced motion or after a manual pause).
  if (!reduceMotion && 'IntersectionObserver' in window) {
    new IntersectionObserver(
      function (entries) {
        var visible = entries[0].isIntersecting
        if (visible && !playing && !userPaused) {
          if (!started) {
            started = true
            single = false
            setPlaying(true)
            beginBeat(0)
          } else if (pending) {
            setPlaying(true)
            later(pending.fn, pending.ms)
          }
        } else if (!visible && playing) {
          pause()
        }
      },
      { threshold: 0.3 }
    ).observe(root)
  }
})()
