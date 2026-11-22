import type { MedicalTextbook, TextbookPage } from '../types/medical';
import { chunkPagesIntoPassages } from '../utils/textbookEngine';

const PHARMACOLOGY_PAGES: TextbookPage[] = [
  {
    pageNumber: 1,
    chapterTitle: 'Chapter 1 (Page 1): Loop Diuretics, ARNI & Inotropic Pharmacology in Heart Failure',
    text: `Chapter 1 (Page 1): Loop Diuretics, ARNI & Inotropic Pharmacology in Heart Failure

Loop Diuretics (Furosemide, Bumetanide, Torsemide): Inhibit the luminal Na+-K+-2Cl- (NKCC2) cotransporter in the thick ascending limb of the Loop of Henle, abolishing the corticomedullary osmotic gradient and increasing urinary excretion of sodium, water, potassium, magnesium, and calcium. Intravenous furosemide produces rapid venodilation (reducing LV preload within 15 minutes via renal prostaglandin release) followed by brisk natriuresis. Adverse effects include hypokalemia, hypomagnesemia, contraction metabolic alkalosis, hyperuricemia/gout, and dose-dependent reversible ototoxicity. Note: Torsemide and bumetanide have higher oral bioavailability (> 80%) than oral furosemide (~50%) in patients with gut wall edema.

Sacubitril-Valsartan (ARNI): Sacubitril inhibits neprilysin, preventing degradation of endogenous natriuretic peptides (ANP, BNP, CNP) and bradykinin, while valsartan blocks AT1 receptors. Because both ACE inhibitors and neprilysin degrade bradykinin, coadministration precipitates life-threatening angioedema — enforce a mandatory 36-hour washout after stopping any ACE inhibitor before starting sacubitril-valsartan.

SGLT2 Inhibitors (Dapagliflozin, Empagliflozin): Inhibit proximal tubular sodium-glucose cotransporter-2, inducing osmotic natriuresis, restoring tubuloglomerular feedback, reducing intraglomerular hypertension, and shifting myocardial energetics toward efficient ketone body oxidation; monitor for euglycemic ketoacidosis during prolonged fasting or surgery.

Acute Inotropes in Cardiogenic Shock: Dobutamine (beta-1 > beta-2 adrenergic agonist) increases myocardial contractility via Gs-cAMP signaling while mildly lowering systemic vascular resistance. Milrinone (selective phosphodiesterase-3 inhibitor) prevents cAMP breakdown in cardiomyocytes and vascular smooth muscle ("inodilator"), remaining effective even in patients on chronic beta-blocker therapy, though systemic hypotension is a key dose-limiting toxicity.`,
  },
  {
    pageNumber: 2,
    chapterTitle: 'Chapter 2 (Page 2): Antiplatelet, Anticoagulant & Reversal Pharmacology',
    text: `Chapter 2 (Page 2): Antiplatelet, Anticoagulant & Reversal Pharmacology

Antiplatelet Agents in Acute Coronary Syndromes: Aspirin irreversibly acetylates platelet cyclooxygenase-1 (COX-1), blocking thromboxane A2 synthesis for the 7-to-10-day platelet lifespan. P2Y12 ADP-receptor antagonists include clopidogrel and prasugrel (irreversible thienopyridine prodrugs; prasugrel is contraindicated in prior stroke/TIA) and ticagrelor (reversible direct P2Y12 inhibitor; can cause benign dyspnea via adenosine reuptake inhibition).

Unfractionated Heparin (UFH) vs. Low-Molecular-Weight Heparin (Enoxaparin): UFH potentiates antithrombin III to inactivate both Factor IIa (thrombin) and Factor Xa (monitored via aPTT; safe in severe renal failure; fully reversed by protamine sulfate). Enoxaparin preferentially inhibits Factor Xa, requires renal clearance (avoid or adjust when CrCl < 30 mL/min), and is only partially (~60%) neutralized by protamine.

Direct Oral Anticoagulants (DOACs) & Targeted Reversal: Apixaban and rivaroxaban directly inhibit Factor Xa (reversed in life-threatening bleeding by andexanet alfa or 4-factor PCC). Dabigatran directly inhibits free and clot-bound Factor IIa/thrombin (reversed specifically by idarucizumab monoclonal antibody fragment). Warfarin inhibits vitamin K epoxide reductase (VKORC1), depleting Factors II, VII, IX, X, and Proteins C and S; reverse major warfarin hemorrhage immediately with 4-factor prothrombin complex concentrate (4F-PCC) PLUS intravenous vitamin K1.`,
  },
  {
    pageNumber: 3,
    chapterTitle: 'Chapter 3 (Page 3): Vasopressors & Shock Receptor Hemodynamics',
    text: `Chapter 3 (Page 3): Vasopressors & Shock Receptor Hemodynamics

Norepinephrine (alpha-1 >> beta-1 > beta-2): First-line vasopressor for septic, cardiogenic (with severe hypotension), and distributive shock. Potent alpha-1 peripheral vasoconstriction raises Mean Arterial Pressure (MAP >= 65 mmHg) while modest beta-1 activity preserves stroke volume without excessive tachycardia.

Vasopressin (V1a vascular smooth muscle + V2 collecting duct agonist): Second-line catecholamine-sparing vasoconstrictor added to norepinephrine in refractory septic shock; acts independently of adrenergic receptors and remains active during severe metabolic acidosis.

Epinephrine (potent beta-1, beta-2, and dose-dependent alpha-1 agonist): Drug of choice for intramuscular anaphylaxis (0.3-0.5 mg IM into anterolateral thigh; stabilizes mast cells via beta-2 cAMP and reverses laryngeal edema/hypotension via alpha-1). At high IV infusions, increases serum lactate via beta-2 skeletal muscle aerobic glycolysis.

Phenylephrine (pure alpha-1 agonist): Increases systemic vascular resistance and triggers baroreceptor-mediated reflex bradycardia; avoid in cardiogenic shock because pure afterload elevation depresses stroke volume.`,
  },
  {
    pageNumber: 4,
    chapterTitle: 'Chapter 4 (Page 4): Insulin Kinetics, DKA Electrolyte Shifts & Oral Antihyperglycemics',
    text: `Chapter 4 (Page 4): Insulin Kinetics, DKA Electrolyte Shifts & Oral Antihyperglycemics

Regular Intravenous Insulin in Diabetic Ketoacidosis (DKA): Suppresses hepatic ketogenesis (inhibiting hormone-sensitive lipase and carnitine palmitoyltransferase-I) far faster than hyperglycemia resolves. Insulin stimulates cell-membrane Na+/K+-ATPase pumps, driving extracellular potassium into skeletal muscle and hepatocytes: NEVER start IV insulin if serum K+ < 3.3 mEq/L (replete IV KCl first to prevent fatal torsades/ventricular fibrillation); add 20-30 mEq/L KCl to IV fluids when serum K+ is 3.3-5.2 mEq/L; transition from 0.9% NaCl to D5-0.45% NaCl once serum glucose reaches 200-250 mg/dL while continuing IV insulin until the anion gap closes!

Metformin (Biguanide): Activates hepatic AMP-activated protein kinase (AMPK) and inhibits mitochondrial glycerophosphate dehydrogenase to suppress gluconeogenesis without causing hypoglycemia or weight gain. Contraindicated when eGFR < 30 mL/min/1.73m2, decompensated heart failure, or iodinated contrast AKI due to metformin-associated lactic acidosis.

GLP-1 Receptor Agonists (Semaglutide, Liraglutide): Augment glucose-dependent insulin secretion, suppress glucagon, delay gastric emptying, reduce major adverse cardiovascular events, and promote weight loss; counsel on pancreatitis risk and medullary thyroid C-cell hyperplasia history.`,
  },
  {
    pageNumber: 5,
    chapterTitle: 'Chapter 5 (Page 5): Antimicrobial Mechanisms, Stewardship & Toxicities',
    text: `Chapter 5 (Page 5): Antimicrobial Mechanisms, Stewardship & Toxicities

Cell-Wall Synthesis Inhibitors: Beta-lactams (penicillins, cephalosporins, carbapenems, aztreonam) exhibit time-dependent bactericidal killing by acylating Penicillin-Binding Proteins (PBPs). Ceftriaxone achieves biliary + hepatic clearance (no renal dose adjustment required; avoid co-infusion with calcium in neonates). Piperacillin-tazobactam and cefepime provide antipseudomonal coverage. Vancomycin binds D-Ala-D-Ala peptidoglycan precursors (MRSA coverage; monitor AUC/MIC ratio 400-600; rapid infusion triggers histamine-mediated flushing reaction; combination with piperacillin-tazobactam increases acute tubular necrosis risk).

Protein Synthesis & DNA Topoisomerase Inhibitors: Macrolides (azithromycin, 50S ribosomal translocation block; prolongs QTc interval) and doxycycline (30S ribosomal block; covers atypical pneumonia, Rickettsia, Borrelia; causes pill esophagitis and photosensitivity). Fluoroquinolones (levofloxacin, ciprofloxacin; inhibit DNA gyrase/topoisomerase IV; carry boxed warnings for tendinopathy/Achilles rupture, aortic aneurysm dissection, peripheral neuropathy, and QT prolongation). Linezolid (50S initiation complex inhibitor for MRSA/VRE; causes reversible myelosuppression/thrombocytopenia after > 14 days and serotonin syndrome with SSRIs via MAO inhibition).`,
  },
  {
    pageNumber: 6,
    chapterTitle: 'Chapter 6 (Page 6): Vaughan Williams Antiarrhythmic & Rate-Control Pharmacology',
    text: `Chapter 6 (Page 6): Vaughan Williams Antiarrhythmic & Rate-Control Pharmacology

Class I Sodium-Channel Blockers (Use-Dependent): Class IA (procainamide — drug of choice for hemodynamically stable atrial fibrillation with Wolff-Parkinson-White accessory pathway; causes reversible drug-induced lupus with anti-histone antibodies and QT prolongation). Class IC (flecainide, propafenone — potent INa block; strictly contraindicated in structural or ischemic heart disease post-MI due to proarrhythmic sudden death in the CAST trial!).

Class III Potassium-Channel Blockers: Amiodarone prolongs action potential duration and effective refractory period with minimal torsades de pointes risk despite QT prolongation, making it safe in HFrEF; chronic maintenance requires baseline and serial PFTs (pulmonary fibrosis), TSH (hypo- or hyperthyroidism via Wolff-Chaikoff / Jod-Basedow effects), LFTs, and slit-lamp corneal microdeposit exams.

AV Nodal Blockers (Class II Beta-Blockers, Class IV Diltiazem/Verapamil, Adenosine): Adenosine activates Gi-coupled A1 receptors to open K+ channels and hyperpolarize the AV node (terminates paroxysmal SVT; antagonized by caffeine/theophylline; potentiated by dipyridamole; causes transient chest flushing/bronchospasm).`,
  },
  {
    pageNumber: 7,
    chapterTitle: 'Chapter 7 (Page 7): Status Epilepticus & Antiseizure Therapeutics',
    text: `Chapter 7 (Page 7): Status Epilepticus & Antiseizure Therapeutics

First-Line Benzodiazepines (Lorazepam IV, Midazolam IM): Bind allosteric benzodiazepine sites on synaptic GABA-A chloride channels, increasing the FREQUENCY of channel opening to terminate acute convulsive status epilepticus within minutes. Watch for respiratory depression and hypotension.

Second-Line IV Antiseizure Loads:
- Levetiracetam (60 mg/kg IV): Binds synaptic vesicle glycoprotein SV2A to modulate neurotransmitter exocytosis; minimal hepatic CYP450 drug interactions and zero cardiac monitoring requirement (watch for neuropsychiatric irritability).
- Fosphenytoin / Phenytoin (20 mg PE/kg IV): Stabilizes inactivated voltage-gated neuronal Na+ channels; follows zero-order saturable elimination kinetics at therapeutic concentrations, induces CYP450 enzymes, and carries arrhythmia/hypotension risk during infusion (fosphenytoin avoids purple-glove tissue necrosis).
- Valproate (40 mg/kg IV): Blocks T-type Ca2+ and Na+ channels while increasing brain GABA; strictly contraindicated in pregnancy (neural tube defects) and urea cycle/mitochondrial POLG disorders (fatal hyperammonemic hepatotoxicity).`,
  },
  {
    pageNumber: 8,
    chapterTitle: 'Chapter 8 (Page 8): Bronchodilators, Biologics & Corticosteroid Pharmacology',
    text: `Chapter 8 (Page 8): Bronchodilators, Biologics & Corticosteroid Pharmacology

Beta-2 Adrenergic Agonists (Albuterol SABA, Formoterol/Salmeterol LABA): Stimulate Gs-adenylyl cyclase to raise intracellular cAMP and relax bronchial smooth muscle. High-dose nebulized albuterol causes tremor, sinus tachycardia, and transient hypokalemia (intracellular K+ shift). LABAs must NEVER be prescribed as monotherapy in asthma without an Inhaled Corticosteroid (ICS).

Muscarinic Antagonists (Ipratropium SAMA, Tiotropium LAMA): Competitively block M3 muscarinic receptors on airway smooth muscle, decreasing cGMP-mediated bronchoconstriction and mucus hypersecretion.

Glucocorticoids (Prednisone, Methylprednisolone, Budesonide): Bind cytosolic glucocorticoid receptors to upregulate annexin-1 (lipocortin-1, inhibiting phospholipase A2) and repress NF-kB transcription of pro-inflammatory cytokines. Rinse mouth after ICS use to prevent oropharyngeal candidiasis and dysphonia. Intravenous Magnesium Sulfate (2 g IV over 20 min) blocks bronchial smooth muscle voltage-gated calcium channels during refractory status asthmaticus.`,
  },
  {
    pageNumber: 9,
    chapterTitle: 'Chapter 9 (Page 9): Immunosuppressants & Disease-Modifying Agents in SLE & IBD',
    text: `Chapter 9 (Page 9): Immunosuppressants & Disease-Modifying Agents in SLE & IBD

Hydroxychloroquine: Lysosomotropic antimalarial that raises endosomal pH and inhibits Toll-like receptor (TLR7/TLR9) nucleic-acid signaling in plasmacytoid dendritic cells. Reduces lupus flares, thrombotic events, and mortality; requires baseline and annual after 5 years optical coherence tomography (OCT) + visual field screening for bull's-eye maculopathy/retinopathy.

Mycophenolate Mofetil (MMF) vs. Cyclophosphamide in Lupus Nephritis: MMF reversibly inhibits inosine monophosphate dehydrogenase (IMPDH), blocking de novo purine synthesis selectively in B and T lymphocytes (teratogenic; GI toxicity). Cyclophosphamide is an alkylating nitrogen mustard prodrug (causes hemorrhagic cystitis via acrolein metabolite — prevent with IV mesna and hydration; also causes gonadal toxicity).

Azathioprine & 6-Mercaptopurine: Check thiopurine methyltransferase (TPMT) and NUDT15 enzyme activity prior to initiation; co-administration with allopurinol or febuxostat (xanthine oxidase inhibitors) causes severe pancytopenia unless thiopurine dose is reduced by 75%!`,
  },
  {
    pageNumber: 10,
    chapterTitle: 'Chapter 10 (Page 10): Portal Hypertension, GI Bleeding & Hepatic Pharmacology',
    text: `Chapter 10 (Page 10): Portal Hypertension, GI Bleeding & Hepatic Pharmacology

Octreotide (Somatostatin Analog): Inhibits release of splanchnic vasodilatory peptides (glucagon, VIP, substance P), producing selective splanchnic arteriolar vasoconstriction that acutely lowers portal venous inflow and variceal pressure during acute variceal hemorrhage.

Non-Selective Beta-Blockers in Cirrhosis (Propranolol, Nadolol, Carvedilol): Beta-1 blockade decreases cardiac output while beta-2 blockade allows unopposed alpha-1 splanchnic vasoconstriction, providing primary and secondary prophylaxis against gastroesophageal variceal bleeding. Hold non-selective beta-blockers during acute spontaneous bacterial peritonitis (SBP), refractory ascites with SBP < 90 mmHg, or hepatorenal syndrome!

Lactulose & Rifaximin in Hepatic Encephalopathy: Colonic bacteria metabolize lactulose into lactic and acetic acids, lowering luminal pH to convert absorbable ammonia (NH3) into non-absorbable ammonium ions (NH4+) excreted cathartically. Rifaximin is a non-absorbed oral rifamycin antibiotic that suppresses gut urease-producing flora.`,
  },
  {
    pageNumber: 11,
    chapterTitle: 'Chapter 11 (Page 11): Nephrotoxins, Diuretic Sites of Action & Hyperkalemia Emergencies',
    text: `Chapter 11 (Page 11): Nephrotoxins, Diuretic Sites of Action & Hyperkalemia Emergencies

Classic Drug-Induced Acute Kidney Injury Mechanisms:
- Prerenal Hemodynamic AKI: NSAIDs inhibit vasodilatory afferent arteriolar prostaglandins (PGE2/PGI2), whereas ACE inhibitors/ARBs block angiotensin-II efferent arteriolar constriction — combining NSAIDs + ACEi/ARB + diuretic ("triple whammy") precipitates acute GFR collapse!
- Acute Tubular Necrosis (ATN): Aminoglycosides (gentamicin), iodinated radiocontrast, cisplatin, amphotericin B, and vancomycin.
- Acute Interstitial Nephritis (AIN): Beta-lactams, proton pump inhibitors, sulfonamides, and NSAIDs (fever, rash, eosinophilia, WBC casts).

Hyperkalemia Emergency Pharmacology Sequence (K+ >= 6.5 mEq/L or peaked T waves / QRS widening):
1. Membrane Stabilization (Immediate, 1-3 min): Intravenous Calcium Gluconate stabilizes resting cardiomyocyte threshold potential without altering serum K+.
2. Intracellular Shift (15-30 min): IV Regular Insulin (10 units) + Dextrose 25 g, plus high-dose nebulized Albuterol.
3. Total-Body Potassium Elimination: Loop diuretics (furosemide if non-oliguric), gastrointestinal cation binders (patiromer or sodium zirconium cyclosilicate; avoid sodium polystyrene sulfonate post-op due to colonic necrosis), or emergent hemodialysis.`,
  },
  {
    pageNumber: 12,
    chapterTitle: 'Chapter 12 (Page 12): Clinical Toxicology & High-Yield Emergency Antidotes',
    text: `Chapter 12 (Page 12): Clinical Toxicology & High-Yield Emergency Antidotes

Acetaminophen (Paracetamol) Overdose: Saturation of hepatic glucuronidation/sulfation diverts metabolism via CYP2E1 to toxic NAPQI, depleting glutathione and causing centrilobular (Zone III) hepatic necrosis. Plot serum acetaminophen concentration >= 4 hours post-ingestion on the Rumack-Matthew nomogram and administer N-acetylcysteine (NAC) promptly to replenish hepatic glutathione stores.

Salicylate (Aspirin) Toxicity: Early medullary respiratory center stimulation causes primary respiratory alkalosis, rapidly followed by uncoupling of oxidative phosphorylation causing a mixed high-anion-gap metabolic acidosis, tinnitus, and hyperthermia. Treat with IV sodium bicarbonate to alkalinize serum and urine (pH 7.5-8.0, ion-trapping salicylate in renal tubules) and hemodialysis for coma, pulmonary edema, or serum salicylate > 100 mg/dL.

Rapid Antidote Reference: Opioids -> Naloxone; Benzodiazepines -> Flumazenil (avoid in chronic benzodiazepine dependence or TCA co-ingestion due to refractory seizures!); Tricyclic Antidepressant wide-QRS cardiotoxicity -> IV Sodium Bicarbonate; Beta-blocker refractory shock -> High-dose IV Glucagon (bypasses beta-receptors to raise cAMP) + high-dose insulin euglycemia; Organophosphates -> Atropine (muscarinic drying) + Pralidoxime (regenerates acetylcholinesterase before aging); Cyanide -> Hydroxocobalamin.`,
  },
];

const PHARMACOLOGY_PASSAGES = chunkPagesIntoPassages(PHARMACOLOGY_PAGES);

export const SAMPLE_PHARMACOLOGY_BOOK: MedicalTextbook = {
  id: 'atlas-clinical-pharmacology-2026',
  title: 'Clinical Pharmacology & Acute Therapeutics Atlas (12 Chapters)',
  subject: 'Pharmacology & Therapeutics',
  fileName: 'Sample_Clinical_Pharmacology_Atlas.pdf',
  pageCount: PHARMACOLOGY_PAGES.length,
  passageCount: PHARMACOLOGY_PASSAGES.length,
  uploadedAt: '2026-10-02T10:30:00.000Z',
  fileSizeBytes: 348_200,
  isSample: true,
  pages: PHARMACOLOGY_PAGES,
};
