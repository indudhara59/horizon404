import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { api } from '../lib/api'
import type { TerrainPatch } from '../lib/types'

interface Props {
  lat: number
  lon: number
  mast: number
  sunAz: number
  sunEl: number
  sunFrac: number
  earthAz: number
  earthEl: number
  earthVisible: boolean
}

type View = 'orbit' | 'lander'

const SKY_R = 600 // km, radius for the Sun / Earth / stars

/** Unit vector for azimuth (from north, clockwise) and elevation, in scene axes (x = east, y = up, z = south). */
function dir(azDeg: number, elDeg: number): THREE.Vector3 {
  const az = THREE.MathUtils.degToRad(azDeg)
  const el = THREE.MathUtils.degToRad(elDeg)
  return new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el))
}

/**
 * Real LOLA terrain around the site, lit by the computed Sun position with shadows.
 * 1 scene unit = 1 km, heights relative to the site with the Moon's curvature applied.
 */
export default function Terrain3D(p: Props) {
  const host = useRef<HTMLDivElement>(null)
  const three = useRef<{
    renderer: THREE.WebGLRenderer
    scene: THREE.Scene
    camera: THREE.PerspectiveCamera
    controls: OrbitControls
    sun: THREE.DirectionalLight
    sunBall: THREE.Mesh
    earthBall: THREE.Mesh
    mesh?: THREE.Mesh
    lander: THREE.Group
    patch?: TerrainPatch
  } | null>(null)
  const [patch, setPatch] = useState<TerrainPatch | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [view, setView] = useState<View>('orbit')
  const [exag, setExag] = useState(1)

  // --- scene setup (once) --------------------------------------------------
  useEffect(() => {
    const el = host.current!
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    el.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#02040a')

    const camera = new THREE.PerspectiveCamera(50, 1, 0.0005, 3000)
    camera.position.set(0, 14, 30)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.maxDistance = 120
    controls.maxPolarAngle = Math.PI * 0.495

    // faint "earthshine" so shadowed ground is not pure black (it nearly is in reality)
    scene.add(new THREE.HemisphereLight('#9fb4ff', '#1a1a22', 0.35))

    const sun = new THREE.DirectionalLight('#fff4dc', 3.2)
    sun.castShadow = true
    sun.shadow.mapSize.set(4096, 4096)
    const sc = sun.shadow.camera
    sc.left = -30; sc.right = 30; sc.top = 30; sc.bottom = -30; sc.near = 1; sc.far = 400
    sun.shadow.bias = -0.0004
    sun.shadow.normalBias = 0.04
    scene.add(sun, sun.target)

    const sunBall = new THREE.Mesh(new THREE.SphereGeometry(9, 32, 16), new THREE.MeshBasicMaterial({ color: '#ffd76a' }))
    const earthBall = new THREE.Mesh(new THREE.SphereGeometry(12, 32, 16), new THREE.MeshBasicMaterial({ color: '#5aa9ff' }))
    scene.add(sunBall, earthBall)

    // stars
    const starPos = new Float32Array(2400 * 3)
    for (let i = 0; i < 2400; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(SKY_R * 1.4)
      starPos.set([v.x, v.y, v.z], i * 3)
    }
    const stars = new THREE.BufferGeometry()
    stars.setAttribute('position', new THREE.BufferAttribute(starPos, 3))
    scene.add(new THREE.Points(stars, new THREE.PointsMaterial({ color: '#cbd5e1', size: 1.4, sizeAttenuation: false })))

    // lander marker: a beacon pole you can find from orbit
    const lander = new THREE.Group()
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.04, 0.8, 8),
      new THREE.MeshBasicMaterial({ color: '#4ade80' }),
    )
    pole.position.y = 0.4
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 8), new THREE.MeshBasicMaterial({ color: '#4ade80' }))
    tip.position.y = 0.85
    lander.add(pole, tip)
    scene.add(lander)

    three.current = { renderer, scene, camera, controls, sun, sunBall, earthBall, lander }

    const resize = () => {
      const w = el.clientWidth
      const h = el.clientHeight
      renderer.setSize(w, h)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    }
    const ro = new ResizeObserver(resize)
    ro.observe(el)
    resize()

    let raf = 0
    const loop = () => {
      controls.update()
      renderer.render(scene, camera)
      raf = requestAnimationFrame(loop)
    }
    loop()

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      controls.dispose()
      scene.traverse((o) => {
        const m = o as THREE.Mesh
        m.geometry?.dispose()
        const mat = m.material as THREE.Material | THREE.Material[] | undefined
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose())
        else mat?.dispose()
      })
      renderer.dispose()
      el.removeChild(renderer.domElement)
      three.current = null
    }
  }, [])

  // --- terrain for the selected site -----------------------------------------
  useEffect(() => {
    let stale = false
    setErr(null)
    api
      .terrain(p.lat, p.lon)
      .then((t) => !stale && setPatch(t))
      .catch((e: Error) => {
        if (stale) return
        setPatch(null)
        setErr(e.message)
      })
    return () => {
      stale = true
    }
  }, [p.lat, p.lon])

  useEffect(() => {
    const t = three.current
    if (!t) return
    if (t.mesh) {
      t.scene.remove(t.mesh)
      t.mesh.geometry.dispose()
      ;(t.mesh.material as THREE.Material).dispose()
      t.mesh = undefined
    }
    if (!patch) return
    const size = patch.half_km * 2
    const geo = new THREE.PlaneGeometry(size, size, patch.n - 1, patch.n - 1)
    geo.rotateX(-Math.PI / 2) // plane in x (east) / z (south); row 0 of the patch is the north edge
    const pos = geo.attributes.position as THREE.BufferAttribute
    const colors = new Float32Array(pos.count * 3)
    const span = Math.max(1, patch.max_m - patch.min_m)
    for (let i = 0; i < pos.count; i++) {
      const hM = patch.heights[i]
      pos.setY(i, (hM / 1000) * exag)
      // subtle tint: low = cool grey, high = warm grey
      const f = (hM - patch.min_m) / span
      colors.set([0.42 + 0.2 * f, 0.42 + 0.17 * f, 0.45 + 0.1 * f], i * 3)
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    geo.computeVertexNormals()
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 }))
    mesh.castShadow = true
    mesh.receiveShadow = true
    t.scene.add(mesh)
    t.mesh = mesh
    t.patch = patch
  }, [patch, exag])

  // --- camera mode ---------------------------------------------------------------
  useEffect(() => {
    const t = three.current
    if (!t) return
    if (view === 'lander') {
      const eye = new THREE.Vector3(0, (p.mast + 1.5) / 1000, 0)
      t.camera.position.copy(eye)
      t.controls.target.copy(eye.clone().add(dir(p.sunAz, 0).multiplyScalar(0.01)))
      t.controls.minDistance = 0.009
      t.controls.maxDistance = 0.011
      t.controls.maxPolarAngle = Math.PI * 0.75
      t.camera.fov = 70
    } else {
      // start on the Sun's side, looking across sunlit slopes with shadows falling away
      const back = dir(p.sunAz, 0).multiplyScalar(30)
      t.camera.position.set(back.x, 20, back.z)
      t.controls.target.set(0, 0, 0)
      t.controls.minDistance = 2
      t.controls.maxDistance = 120
      t.controls.maxPolarAngle = Math.PI * 0.495
      t.camera.fov = 50
    }
    t.camera.updateProjectionMatrix()
    t.lander.visible = view === 'orbit'
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, p.mast, patch?.lat, patch?.lon])

  // --- Sun & Earth for the current time step -----------------------------------
  useEffect(() => {
    const t = three.current
    if (!t) return
    const s = dir(p.sunAz, p.sunEl)
    const e = dir(p.earthAz, p.earthEl)
    t.sun.position.copy(s.clone().multiplyScalar(200))
    t.sun.intensity = 3.2 * Math.max(0.05, p.sunFrac)
    t.sun.visible = p.sunEl > -1
    t.sunBall.position.copy(s.clone().multiplyScalar(SKY_R))
    t.earthBall.position.copy(e.clone().multiplyScalar(SKY_R))
  }, [p.sunAz, p.sunEl, p.sunFrac, p.earthAz, p.earthEl])

  return (
    <div className="terrain3d">
      <div className="terrain3d-bar">
        <div className="layer-switch">
          <button className={view === 'orbit' ? 'active' : ''} onClick={() => setView('orbit')}>🛰️ Orbit</button>
          <button className={view === 'lander' ? 'active' : ''} onClick={() => setView('lander')}>🧑‍🚀 Lander's eye</button>
        </div>
        <label className="inline">
          Height ×{exag}
          <input type="range" min={1} max={4} step={0.5} value={exag} onChange={(e) => setExag(+e.target.value)} />
        </label>
      </div>
      <div ref={host} className="terrain3d-canvas">
        {err && <div className="terrain3d-msg">{err}</div>}
        {!err && !patch && <div className="terrain3d-msg">Loading LOLA terrain…</div>}
        <div className="terrain3d-legend">
          <span className={p.sunFrac > 0.01 ? 'on-sun' : 'off'}>☀️ {p.sunEl.toFixed(1)}°</span>
          <span className={p.earthVisible ? 'on-earth' : 'off'}>🌍 {p.earthEl.toFixed(1)}°</span>
        </div>
      </div>
      <p className="hint">
        {patch
          ? `${patch.half_km * 2} × ${patch.half_km * 2} km of LOLA terrain centred on the site (green beacon), lit by the computed Sun. Drag to orbit, scroll to zoom. Lander's eye looks around from the mast top. Shadows are real; the faint fill light is for readability. The patch shows terrain within ${patch.half_km} km; the 360° sky view also counts ridges up to 200 km away.`
          : '3D terrain uses the LOLA south-pole elevation model.'}
      </p>
    </div>
  )
}
