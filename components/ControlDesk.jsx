'use client';

import { useShow } from '@/app/show-context';
import { COLOR_MODES, DIRECTIONS, FIXTURE_HINTS, FIXTURE_LABELS, PATTERNS } from '@/lib/themes';
import { Fader, LedDot, Panel, Segmented, Switch } from './ui';

const GROUPS = [
  { title: 'Moving Heads', keys: ['spot', 'wash', 'beam'] },
  { title: 'PAR Cans', keys: ['ledPar', 'classicPar'] },
  { title: 'Effects', keys: ['strobe', 'laser', 'blinder', 'fog'] },
];

export default function ControlDesk() {
  const { scene, updateScene, toggleFixture, resetScene, pulseBlinder, theme, playerState } = useShow();
  const f = scene.fixtures;

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {/* ------------------------------------------------------ master */}
      <Panel
        className="rack-screw"
        title="Master / DMX"
        right={
          <span className="flex items-center gap-2 text-[10px] text-white/40">
            <LedDot on={!scene.blackout} color={theme.accent} />
            {scene.blackout ? 'BLACKOUT' : 'LIVE'}
          </span>
        }
      >
        <div className="space-y-3">
          <Fader label="Master intensity" value={scene.intensity} onChange={(v) => updateScene({ intensity: v })} unit="%" />
          <Fader label="Contrast" value={scene.contrast} onChange={(v) => updateScene({ contrast: v })} unit="%" />
          <Fader label="Movement speed" value={scene.speed} onChange={(v) => updateScene({ speed: v })} unit="%" />
          <Fader label="Beam width" value={scene.beamWidth} onChange={(v) => updateScene({ beamWidth: v })} unit="%" />
        </div>

        <div className="grid grid-cols-3 gap-2 mt-4">
          <button
            type="button"
            className={`btn ${scene.blackout ? 'btn-accent' : ''}`}
            onClick={() => updateScene({ blackout: !scene.blackout })}
          >
            Blackout
          </button>
          <button
            type="button"
            className="btn"
            onMouseDown={pulseBlinder}
            onTouchStart={pulseBlinder}
            title="Momentary — fires the blinders at the crowd"
          >
            Blind!
          </button>
          <button type="button" className="btn" onClick={resetScene}>
            Reset
          </button>
        </div>

        <p className="mt-3 text-[10px] text-white/35 leading-relaxed">
          Beat clock:{' '}
          <span className="text-white/60">
            {playerState.analysable ? 'live audio analysis' : `${theme.bpm} BPM (theme tempo)`}
          </span>
          . Streamed previews and YouTube can't be analysed in the browser, so the rig follows the tempo instead.
        </p>
      </Panel>

      {/* --------------------------------------------------- movement */}
      <Panel className="rack-screw" title="Movement / Colour">
        <div className="space-y-4">
          <Segmented label="Pattern" options={PATTERNS} value={scene.pattern} onChange={(v) => updateScene({ pattern: v })} />
          <Segmented label="Direction" options={DIRECTIONS} value={scene.direction} onChange={(v) => updateScene({ direction: v })} />
          <Segmented label="Colour mode" options={COLOR_MODES} value={scene.colorMode} onChange={(v) => updateScene({ colorMode: v })} />
          <div className="panel-tight px-1 py-1">
            <Switch
              label="Beat sync"
              hint="Pulse every fixture with the kick"
              on={scene.beatSync}
              onToggle={() => updateScene({ beatSync: !scene.beatSync })}
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {theme.palette.map((c) => (
              <span key={c} className="w-6 h-6 rounded-md border border-white/10" style={{ background: c, boxShadow: `0 0 12px ${c}55` }} />
            ))}
          </div>
        </div>
      </Panel>

      {/* --------------------------------------------------- fixtures */}
      <Panel className="rack-screw" title="Fixture patch">
        <div className="space-y-3">
          {GROUPS.map((g) => (
            <div key={g.title}>
              <div className="label mb-1">{g.title}</div>
              <div className="panel-tight divide-y divide-white/5">
                {g.keys.map((k) => (
                  <div key={k} className="flex items-center gap-2 pr-3 min-w-0">
                    <Switch label={FIXTURE_LABELS[k]} hint={FIXTURE_HINTS[k]} on={f[k]} onToggle={() => toggleFixture(k)} />
                    <span className="flex-none">
                      <LedDot on={f[k]} color={theme.accent} />
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Panel>

      {/* ---------------------------------------------------- effects */}
      <Panel className="rack-screw" title="Effect engines">
        <div className="space-y-3">
          <div>
            <Fader
              label="Strobe rate"
              value={scene.strobeRate}
              disabled={!f.strobe}
              onChange={(v) => updateScene({ strobeRate: v })}
              unit="%"
            />
            <p className="text-[10px] text-white/35 mt-1">
              {f.strobe ? `≈ ${(1.6 + (scene.strobeRate / 100) * 16.4).toFixed(1)} flashes / sec` : 'Strobes are patched out'}
            </p>
          </div>
          <div>
            <Fader
              label="Laser density"
              value={scene.laserDensity}
              disabled={!f.laser}
              onChange={(v) => updateScene({ laserDensity: v })}
              unit="%"
            />
            <p className="text-[10px] text-white/35 mt-1">
              {f.laser ? `${Math.round(3 + (scene.laserDensity / 100) * 23)} beams per emitter` : 'Lasers are patched out'}
            </p>
          </div>
          <div>
            <Fader
              label="Fog density"
              value={scene.fogDensity}
              disabled={!f.fog}
              onChange={(v) => updateScene({ fogDensity: v })}
              unit="%"
            />
            <p className="text-[10px] text-white/35 mt-1">
              {f.fog ? 'Haze makes every beam visible in the air' : 'No haze — beams fade, only pools land'}
            </p>
          </div>
        </div>
      </Panel>
    </div>
  );
}
