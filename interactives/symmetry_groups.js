import { VisDomain } from "./vis_domain.js"
import {Color, GridHelper, Vector3} from "../external/three.module.js"

import * as THREE from "../external/three.module.js"
import * as TWEEN from "../external/tween.esm.js"

import {VisText} from "./text_elem.js"
import {SymmetricObject} from "./symmetric_object.js"
import {explainMatrix, motionFromMatrix, SHAPES} from "./symmetries.js"
import {VisObject} from "./vis_object.js"

Object.assign(window, { THREE })

// Styling info for y'all
// You can just set the value in styles and it will automatically update
let styles = {
  //triangleColor: { default: 0x8f8f1f, handler: setColor(() => triangleMaterial) },
  gridColor: { default: 0x888888, handler: v => mainGrid.colorCenterLine = mainGrid.colorGrid = new Color(v) },
  backgroundColor: { default: 0xf0f0f0, handler: v => (mainDomain.setBG(v), miniatureDomain.setBG(v)) },
  //selectedTriangleColor: { default: 0x3f3f3f, handler: setColor(() => selectedTriangleMaterial)},
  allow3DRotation: { default: false, handler: v => (mainDomain.allow3DRotation(v), DOM.allow3DRotation.checked = v) }
}

Object.assign(window, { styles })

// Note, if you change this you will have to change some other stuff
const SIZE = 15 // width of the entire grid
const gridDivisions = 15

// Overall scaling factor used for units
const SCALE = SIZE / gridDivisions
const gridSize = SIZE

let DOM = {} // mapping from id -> element
let DOMList = {
  mainSurface: "main-surface",
  groupSelectors: "group-selectors",
  items: "items",
  allow3DRotation: "allow-3d",
  miniature: "miniature"
}

// Retrieve elements
for (let [ name, id ] of Object.entries(DOMList))
  if (!(DOM[name] = document.getElementById(id))) throw new Error(`Id ${id} doesn't exist`)

function setColor(target) {
  return v => target().color = new Color(v)
}

// Set all styles to their default values
function setStyleDefaults () {
  for (let o of Object.values(styles)) {
    (o.setDefault = () => o.handler(o.value = o.default))()
  }
}

DOM.allow3DRotation.addEventListener("input", () => {
  mainDomain.allow3DRotation(DOM.allow3DRotation.checked)
})

const mainDomain = new VisDomain({ defaultCameraPosition: new Vector3(0, SIZE / 2, 0) })
mainDomain.attachToElement(DOM.mainSurface)

const mainGrid = new GridHelper(gridSize, gridDivisions)
mainDomain.scene.add(mainGrid)


const miniatureDomain = new VisDomain( { defaultCameraPosition: new Vector3(1, 1.1, 1) })
miniatureDomain.attachToElement(DOM.miniature)
miniatureDomain.setDefaultCamera()

let text = new VisText({ text: "300", position: new Vector3(0, 0, 0) })
//miniatureDomain.scene.add(text)

function render () {
    mainDomain.tick()
  miniatureDomain.tick()
  TWEEN.update()

  requestAnimationFrame(render)
}

let miniatureSym

let CURRENT_SHAPE = SHAPES.cube

let congaLine = []

function resetAll () {
    congaLine.forEach(c => mainDomain.scene.remove(c))

  let seed = new SymmetricObject({ shape: CURRENT_SHAPE, position: STARTING_POS.clone() })
  congaLine = [ seed ]

  mainDomain.scene.add(seed)
  allowClick(seed)

  miniatureSym?.dispose()
  miniatureDomain.scene.remove(miniatureSym)
  miniatureSym = new SymmetricObject({ shape: CURRENT_SHAPE })

  miniatureDomain.scene.add(miniatureSym)
  miniatureDomain.setDefaultCamera()
  mainDomain.setDefaultCamera()
}

function setShape (shape) {
    CURRENT_SHAPE = shape
  resetAll()
}

let queue = []

let STARTING_POS = new Vector3(-5, 0, -3)

function allowClick (o) {
    o.clickable = true
    o.addVisEventListener("click", () => {
      let t = mainDomain.orbitControls.target
      new TWEEN.Tween(t)
        .to(o.position.clone(), 200)
        .easing(TWEEN.Easing.Quadratic.In)
        .onUpdate(() => {
          if (mainDomain.useTranslationControls) {
            // Move to face down
            mainDomain.camera.position.set(t.x, mainDomain.camera.position.y, t.z)

            mainDomain.orbitControls.update()
          }
        }).start()
    })
}

let congaInMotion = false

function addToCongaLine (motion) {
    if (!motion) return

  if (congaInMotion) {
    queue.push(motion)
    return
  }

  congaInMotion = true

  let last = congaLine[congaLine.length - 1]

  let n = last.castratedClone()
  // Translate n in the +x direction
  mainDomain.scene.add(n)

  congaLine.push(n)
  allowClick(n)

  new TWEEN.Tween(n.position)
    .to(n.position.clone().add(new Vector3(2.5, 0, 0)), 1000)
    .easing(TWEEN.Easing.Quadratic.In)
    .onUpdate(() => {
      n.updateMatrix()

      mainDomain.orbitControls.target.copy(n.position)
      if (mainDomain.useTranslationControls) {
        // Move to face down
        mainDomain.camera.position.set(n.position.x, mainDomain.camera.position.y, n.position.z)

        mainDomain.orbitControls.update()
      }
    })
    .onComplete(() => {
      let god = n.performMotion(motion, 1000)
      if (god) {
        god.onComplete(() => {
          congaInMotion = false
          addToCongaLine(queue.splice(0, 1)[0])
        })
      } else {
        congaInMotion = false
      }
    }).start()
}

let demonstration

function clearDemonstration () {
  // Translate n in the +x direction
  demonstration?.dispose()
  mainDomain.scene.remove(demonstration)
  demonstration = null
}

function demonstrateCongaLine () {
    if (congaLine.length <= 1) return

  if (congaInMotion) return

  let first = congaLine[0]
    let last = congaLine[congaLine.length - 1]

  let shiftDown = new Vector3(0, 0, 4) // z direction
  let n = first.castratedClone()

  n.position.add(shiftDown)
  let n2 = n.castratedClone()

  clearDemonstration()

  demonstration = new VisObject()
  mainDomain.scene.add(demonstration)

  demonstration.add(n)
  demonstration.add(n2)

  allowClick(n)
  allowClick(n2)

  let netMotion = motionFromMatrix(CURRENT_SHAPE, last.currentTransform)
  let expl = explainMatrix(last.currentTransform)

  // TODO rotoreflection
  new TWEEN.Tween(n.position)
    .to(last.position.clone().add(shiftDown), 2000)
    .easing(TWEEN.Easing.Quadratic.In)
    .onUpdate(() => {
      n.updateMatrix()

      mainDomain.orbitControls.target.copy(n.position)
      if (mainDomain.useTranslationControls) {
        // Move to face down
        mainDomain.camera.position.set(n.position.x, mainDomain.camera.position.y, n.position.z)

        mainDomain.orbitControls.update()
      }
    })
    .onComplete(() => {
      let god = n.performMotion(netMotion, 1000)
      if (god) {
        god.onComplete(() => addToCongaLine(queue.splice(0, 1)[0]))
      }
    }).start()
}

setStyleDefaults()
render()

resetAll()

Object.assign(window, { mainDomain, miniatureDomain, addToCongaLine, setShape, demonstrateCongaLine })
