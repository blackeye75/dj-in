'use client';

import { useCallback, useEffect, useState } from 'react';
import { useShow } from '@/app/show-context';
import { COLOR_MODES, DIRECTIONS, FIXTURE_HINTS, FIXTURE_LABELS, PATTERNS } from '@/lib/themes';
import { BACKDROPS, HEX_MODES } from '@/lib/backdrop';
import { RETRO_MODES, RETRO_RIGS, DMX_MODES } from '@/lib/retroHex';
import { Fader, LedDot, Panel, Segmented, Switch } from './ui';

const GROUPS = [
  { title: 'Moving Heads', keys: ['spot', 'wash', 'beam'] },
  { title: 'PAR Cans', keys: ['ledPar', 'classicPar'] },
  { title: 'Effects', keys: ['strobe', 'laser', 'blinder', 'fog'] },
];

export default function ControlDesk() {
  const { scene, updateScene, toggleFixture, resetScene, pulseBlinder, releaseBlinder, theme, playerState } = useShow();
  const [blinding, setBlinding] = useState(false);
  const f = scene.fixtures;

  const holdBlinder = useCallback(() => {
    setBlinding(true);
    pulseBlinder();
  }, [pulseBlinder]);

  const dropBlinder = useCallback(() => {
    setBlinding(false);
    releaseBlinder();
  }, [releaseBlinder]);

  // Hold B for the blinders, the way a desk gives you a hardware flash button.
  useEffect(() => {
    const isTyping = (el) => el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
    const down = (e) => {
      if (e.key !== 'b' && e.key !== 'B') return;
      if (e.repeat || isTyping(document.activeElement)) return;
      holdBlinder();
    };
    const up = (e) => {
      if (e.key === 'b' || e.key === 'B') dropBlinder();
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [holdBlinder, dropBlinder]);

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
            className={`btn select-none ${blinding ? 'btn-accent' : ''}`}
            style={blinding ? { background: '#fff6dc', color: '#08090f', boxShadow: '0 0 26px #fff6dc' } : undefined}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture?.(e.pointerId);
              holdBlinder();
            }}
            onPointerUp={dropBlinder}
            onPointerCancel={dropBlinder}
            onPointerLeave={dropBlinder}
            title="Hold to fire the blinders at the crowd (or hold the B key)"
          >
            Blind!
          </button>
          <button type="button" className="btn" onClick={resetScene}>
            Reset
          </button>
        </div>

        <p className="mt-3 text-[10px] text-white/35 leading-relaxed">
          <span className="text-white/50">Blind!</span> is momentary — hold it (or the <kbd>B</kbd> key) and the blinders
          stay lit at the crowd; let go and they decay. Blackout is the only latching button here.
        </p>

        <p className="mt-2 text-[10px] text-white/35 leading-relaxed">
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

      {/* Column four holds the surface/effect racks, so the desk stays a
          single row of four at desk width. */}
      <div className="space-y-4 min-w-0">
        {/* ------------------------------------------------ retro hex */}
        <Panel
          className="rack-screw"
          title="7-Head Retro Hex Par"
          right={
            <span className="flex items-center gap-2 text-[10px] text-white/40">
              <LedDot on={f.retroHex} color={theme.accent} />
              {scene.retroDmx === 'ch4' ? '4ch' : '42ch'}
            </span>
          }
        >
          <div className="space-y-3">
            <div className="panel-tight px-1 py-1 flex items-center gap-2 pr-3 min-w-0">
              <Switch
                label={FIXTURE_LABELS.retroHex}
                hint={FIXTURE_HINTS.retroHex}
                on={f.retroHex}
                onToggle={() => toggleFixture('retroHex')}
              />
            </div>

            <Segmented
              label="Programme"
              options={RETRO_MODES}
              value={scene.retroMode}
              onChange={(v) => updateScene({ retroMode: v })}
            />
            <div className="grid grid-cols-2 gap-2">
              <Segmented label="Rig" options={RETRO_RIGS} value={scene.retroRig} onChange={(v) => updateScene({ retroRig: v })} />
              <Segmented label="DMX mode" options={DMX_MODES} value={scene.retroDmx} onChange={(v) => updateScene({ retroDmx: v })} />
            </div>

            <Fader
              label="Tungsten filament"
              value={scene.retroFilament}
              disabled={!f.retroHex}
              onChange={(v) => updateScene({ retroFilament: v })}
              unit="%"
            />
            <Fader
              label="RGB pixel ring"
              value={scene.retroPixels}
              disabled={!f.retroHex}
              onChange={(v) => updateScene({ retroPixels: v })}
              unit="%"
            />
            <p className="text-[10px] text-white/35 leading-relaxed">
              {scene.retroDmx === 'ch4'
                ? 'On 4 channels all seven heads take the same colour — one big lamp.'
                : 'On 42 channels every pixel is addressed, so patterns travel across the cluster.'}
            </p>
          </div>
        </Panel>

      {/* --------------------------------------------------- backdrop */}
      <Panel
        className="rack-screw"
        title="Back wall / LED surface"
        right={<span className="text-[10px] text-white/40">{scene.backdrop === 'off' ? 'dark' : scene.backdrop}</span>}
      >
        <div className="space-y-3">
          <Segmented
            label="Wall pattern"
            options={BACKDROPS}
            value={scene.backdrop}
            onChange={(v) => updateScene({ backdrop: v })}
          />
          <div className="grid sm:grid-cols-2 gap-x-4">
            <Fader
              label="Wall brightness"
              value={scene.backdropIntensity}
              disabled={scene.backdrop === 'off'}
              onChange={(v) => updateScene({ backdropIntensity: v })}
              unit="%"
            />
            <Fader
              label="Wall speed"
              value={scene.backdropSpeed}
              disabled={scene.backdrop === 'off'}
              onChange={(v) => updateScene({ backdropSpeed: v })}
              unit="%"
            />
          </div>

          <div className="panel-tight px-1 py-1 flex items-center gap-2 pr-3 min-w-0">
            <Switch
              label={FIXTURE_LABELS.hexPanel}
              hint={FIXTURE_HINTS.hexPanel}
              on={f.hexPanel}
              onToggle={() => toggleFixture('hexPanel')}
            />
            <span className="flex-none">
              <LedDot on={f.hexPanel} color={theme.accent} />
            </span>
          </div>

          <Segmented
            label="Hex wall mode"
            options={HEX_MODES}
            value={scene.hexMode}
            onChange={(v) => updateScene({ hexMode: v })}
          />
          <p className="text-[10px] text-white/35">Sits behind the truss — beams and haze read in front of it.</p>
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
    </div>
  );
}
