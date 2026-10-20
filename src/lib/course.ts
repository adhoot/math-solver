export const COURSES = [
  { id: "algebra-1", label: "Algebra 1" },
  { id: "algebra-2", label: "Algebra 2" },
  { id: "geometry", label: "Geometry" },
  { id: "precalc", label: "PreCalc" },
  { id: "calculus-ab", label: "Calculus AB" },
  { id: "calculus-bc", label: "Calculus BC" },
  { id: "multivariable-calculus", label: "Multivariable Calculus" },
] as const

export type CourseId = (typeof COURSES)[number]["id"]

const BY_ID = new Map<string, (typeof COURSES)[number]>(
  COURSES.map((course) => [course.id, course]),
)
const BY_LABEL = new Map<string, (typeof COURSES)[number]>(
  COURSES.map((course) => [course.label, course]),
)

export function courseLabel(id: CourseId): string {
  return BY_ID.get(id)!.label
}

export function parseCourse(value: unknown): CourseId | null {
  if (typeof value !== "string") return null
  const text = value.trim()
  if (BY_ID.has(text as CourseId)) return text as CourseId
  return BY_LABEL.get(text)?.id ?? null
}

export function courseGuidance(course: CourseId): string {
  const label = courseLabel(course)
  const ceiling = `Use only ideas taught up through ${label}. Do not use a technique from a later course. If the problem needs later mathematics, say so, name that later course, and take the work only as far as ${label} allows.`

  if (course === "algebra-1") {
    return [
      "Voice: short sentences, everyday words, and at most 6 steps. One move per step.",
      "Allowed: arithmetic, fractions, decimals, percents, ratios, linear equations and inequalities, slope, intercept, graphing lines, systems of two linear equations, positive integer exponent rules, adding, subtracting, and multiplying polynomials, greatest-common-factor and simple quadratic factoring, solving quadratics by factoring or square roots, and function notation as input and output.",
      "Not yet: complex numbers, logarithms, exponential functions, trigonometry, geometric proofs, congruence and circle theorems, conic sections, matrices, sequences and series, limits, derivatives, integrals, and multivariable calculus.",
      ceiling,
    ].join(" ")
  }

  if (course === "algebra-2") {
    return [
      "Voice: plain words and about 4 to 8 short steps.",
      "Allowed: everything from Algebra 1, plus complex numbers, rational expressions and equations, completing the square, the quadratic formula, polynomial division, exponential and logarithmic functions, function transformations, composition, inverse functions, arithmetic and geometric sequences, and the algebra of conic sections.",
      "Not yet: Euclidean proofs, congruence and similarity theorems, circle theorems, trigonometry, limits, derivatives, integrals, series tests, and multivariable calculus.",
      ceiling,
    ].join(" ")
  }

  if (course === "geometry") {
    return [
      "Voice: name the fact you use, in clear sentences, about 5 to 8 steps.",
      "Allowed: everything from Algebra 1 and Algebra 2, plus points, lines, angles, parallel lines, triangles, congruence, similarity, quadrilaterals, circles, area, surface area, volume, coordinate geometry, basic proofs, and right-triangle sine, cosine, and tangent.",
      "Not yet: the unit circle, radian measure as a real-valued function, trig identities, the law of sines and cosines, polar coordinates, limits, derivatives, integrals, infinite series, and multivariable calculus.",
      ceiling,
    ].join(" ")
  }

  if (course === "precalc") {
    return [
      "Voice: precise words and one idea at a time. Fuller than Algebra 1, still not a lecture.",
      "Allowed: everything through Geometry, plus the unit circle, radians, trig graphs, inverse trig, trig identities, the law of sines and cosines, polar coordinates, introductory parametric descriptions, vectors in the plane, and end behavior of rational functions described in words.",
      "Not yet: limits as a calculus tool, derivatives, integrals, convergence tests, Taylor series, partial derivatives, and multiple integrals.",
      ceiling,
    ].join(" ")
  }

  if (course === "calculus-ab") {
    return [
      "Voice: complete sentences and standard calculus notation. Show the setup before the calculation.",
      "Allowed: everything through PreCalc, plus limits and continuity, derivatives and their rules, implicit differentiation, related rates, linear approximation, optimization, definite and indefinite integrals, the fundamental theorem of calculus, u-substitution, area, and separable differential equations.",
      "Not yet: parametric and polar calculus, integration by parts, partial fractions, improper integrals, infinite series, Taylor polynomials, partial derivatives, multiple integrals, and vector calculus theorems.",
      ceiling,
    ].join(" ")
  }

  if (course === "calculus-bc") {
    return [
      "Voice: full working with precise notation. Name the rule or test you use.",
      "Allowed: everything through Calculus AB, plus parametric and polar derivatives and areas, integration by parts, trigonometric integrals, partial fractions, improper integrals, sequences and series, convergence tests, and Taylor and Maclaurin polynomials and series.",
      "Not yet: partial derivatives, gradients, multiple integrals, line and surface integrals, Green's theorem, Stokes' theorem, and the divergence theorem.",
      ceiling,
    ].join(" ")
  }

  return [
    "Voice: full reasoning, stated assumptions, and precise notation.",
    "Allowed: everything through Calculus BC, plus functions of several variables, partial derivatives, the gradient, directional derivatives, Lagrange multipliers, double and triple integrals, change of variables, vector fields, line and surface integrals, Green's theorem, Stokes' theorem, and the divergence theorem.",
    "This is the last course in the list. If a question needs mathematics beyond that list, say what is beyond the course and complete only the work these courses cover.",
    ceiling,
  ].join(" ")
}
