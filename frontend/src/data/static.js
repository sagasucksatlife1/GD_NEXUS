const REPO = "https://github.com/sagasucksatlife1/QuantProjects/blob/main";

/** Strategies killed during the ai-hedge-fund research that preceded NEXUS. Only stats that were actually recorded. */
export const FOUNDING_GRAVES = [
  { name: "Kappa curvature", cause: "Look-ahead bias", stat: "Sharpe 2.14 fell to 0.42 once the signal was made causal",
    lesson: "Became the sandbox's causal audit: every strategy is re-run on truncated data." },
  { name: "Disposition effect (long at lows)", cause: "Failed the exposure-matched alpha bar", stat: "Positive on only 28% of names" },
  { name: "Entropy + CUSUM turbulence", cause: "No leg cleared the edge bar", stat: "80.4% of detections fired while kappa was flat, still no edge",
    lesson: "Evidence that the turbulent regime is not forecastable with this model class." },
  { name: "Hilbert phase", cause: "Rejected in research", stat: null },
  { name: "OU mean-reversion variants", cause: "Rejected in research", stat: null },
  { name: "Ridge mean reversion", cause: "Rejected in research", stat: null },
  { name: "Raw momentum", cause: "Rejected in research", stat: null },
  { name: "FX Q3 mean-reversion book", cause: "Forecast edge did not survive portfolio construction", stat: "Ann. −0.32%, Sharpe −0.07, max DD −18.1%",
    lesson: "A replicated forecast is not a tradeable book." },
];

export const LIBRARY = [
  { group: "Used by NEXUS", items: [
    { name: "Deflated Sharpe Ratio", where: "Validation gate. Every version ever tested counts as a trial.",
      tex: "\\text{DSR}=\\Phi\\!\\left(\\frac{(\\widehat{SR}-SR_0)\\sqrt{T-1}}{\\sqrt{1-\\gamma_3\\widehat{SR}+\\frac{\\gamma_4-1}{4}\\widehat{SR}^2}}\\right)",
      ref: "Bailey & López de Prado (2014)" },
    { name: "Causal truncation audit", where: "Sandbox. Weights on day t must not change when data after t is deleted.",
      tex: "\\max_{s\\le c}\\;\\lVert w_s(P_{1:T}) - w_s(P_{1:c})\\rVert_\\infty \\le \\varepsilon",
      ref: "NEXUS sandbox.py" },
    { name: "Permutation entropy", where: "CSI component: ordinal disorder of market returns (63d).",
      tex: "H=-\\frac{1}{\\log m!}\\sum_{\\pi} p(\\pi)\\log p(\\pi)", ref: "Bandt & Pompe (2002)" },
    { name: "Hurst exponent", where: "CSI component: distance from a random walk (252d).",
      tex: "\\operatorname{sd}\\Big(\\sum_{k} r\\Big) \\propto k^{H}", ref: "Aggregated-variance estimator" },
    { name: "Absorption ratio", where: "CSI component: how much the market moves as one body (63d).",
      tex: "AR_t=\\frac{\\lambda_{\\max}(C_t)}{N}", ref: "Kritzman, Li, Page & Rigobon (2011)" },
    { name: "Turbulence index", where: "CSI component: how unusual today's return vector is.",
      tex: "d_t=\\frac{1}{N}(r_t-\\mu)^\\top\\Sigma^{-1}(r_t-\\mu)", ref: "Kritzman & Li (2010)" },
  ]},
  { group: "QuantProjects notebooks", items: [
    { name: "Black-Scholes and Greeks", tex: "C=S_0N(d_1)-Ke^{-rT}N(d_2)", href: `${REPO}/BlackScholes.ipynb` },
    { name: "Monte Carlo option pricing", tex: "\\hat V=e^{-rT}\\frac1N\\sum_i \\text{payoff}(S_T^{(i)})", href: `${REPO}/Monte_Carlo_Option_Simulator.ipynb` },
    { name: "GARCH volatility", tex: "\\sigma_t^2=\\omega+\\alpha\\epsilon_{t-1}^2+\\beta\\sigma_{t-1}^2", href: `${REPO}/GARCH_Volatility_Forecasting.ipynb` },
    { name: "Markowitz mean-variance", tex: "\\min_w\\; w^\\top\\Sigma w\\;\\text{ s.t. }\\; w^\\top\\mu=\\mu^*", href: `${REPO}/Markowitz's_model.ipynb` },
    { name: "Hierarchical risk parity", tex: "w \\leftarrow \\text{recursive bisection on } \\Sigma", href: `${REPO}/Hierarchical_Risk_Parity_Portfolio.ipynb` },
    { name: "Risk parity", tex: "w_i(\\Sigma w)_i = w_j(\\Sigma w)_j", href: `${REPO}/RiskParityPortfolio.ipynb` },
    { name: "Pairs trading", tex: "y_t=\\beta x_t+u_t,\\; u_t\\sim I(0)", href: `${REPO}/PairsTrading.ipynb` },
    { name: "Kalman dynamic hedging", tex: "\\hat\\beta_{t|t}=\\hat\\beta_{t|t-1}+K_t(y_t-x_t\\hat\\beta_{t|t-1})", href: `${REPO}/KalmanDynamicHedging.ipynb` },
    { name: "Momentum strategy", tex: "s_{i,t}=\\frac{P_{i,t-21}}{P_{i,t-252}}-1", href: `${REPO}/Momentum_Strategy.ipynb` },
    { name: "Vasicek, CIR, Hull-White", tex: "dr_t=a(b-r_t)dt+\\sigma\\sqrt{r_t}\\,dW_t", href: `${REPO}/InterestRatesModeling.ipynb` },
    { name: "Credit risk (PD, LGD, EAD)", tex: "EL = PD\\times LGD\\times EAD", href: `${REPO}/CreditRiskModeling.ipynb` },
    { name: "Credit default prediction", tex: "P(\\text{default}\\mid x)=\\sigma(\\beta^\\top x)", href: `${REPO}/creditpredictor.ipynb` },
  ]},
];

export const RESEARCH = [
  { title: "Complexity-Adaptive Allocation: regime-conditional abstention in systematic trading",
    venue: "NEXUS whitepaper", status: "In progress",
    abstract: "Ties gross exposure to a causal Complexity State Index and tests whether abstaining in turbulent regimes improves drawdowns at equal return, using strategies that survived the NEXUS falsification loop." },
  { title: "Kappa curvature post-mortem",
    venue: "Research note and LinkedIn write-up", status: "Published",
    abstract: "How a non-causal curvature estimate produced a Sharpe of 2.14 that collapsed to 0.42 once implemented causally, and why that failure became the sandbox's truncation audit." },
  { title: "Markets Rewritten: Rethinking Tokenisation, Market Structure, and Financial Stability",
    venue: "SSRN preprint", status: "Under journal review",
    abstract: "Argues tokenisation changes trading speed rather than an asset's risk, accelerating exposure of structural weaknesses. Introduces the Liquidity Concentration Index and Market Saturation Index." },
  { title: "Paper Castles",
    venue: "SSRN", status: "Published",
    abstract: "An analysis of the 2008 financial crisis." },
];

export const LINKS = {
  github: "https://github.com/sagasucksatlife1/QuantProjects",
  site: "https://kartikeyasingh.in",
};
