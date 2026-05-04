export interface TaxonomySummary {
  id: string;
  name: string;
  version: number;
  source_type: string;
  risk_count: number;
  control_count: number;
  active: boolean;
  file_name?: string;
  uploaded_at?: string;
  created_at: string;
}

export interface RiskItem {
  risk_id: string;
  category: string;
  name: string;
  description?: string;
  source?: string;
  // NGC hierarchical fields — present when loaded from an L1-L4 spreadsheet
  l1?: string;
  l2?: string;
  l3?: string;
  l3_description?: string;
  l4?: string;
  l4_description?: string;
}

export interface ControlItem {
  control_id: string;
  control_name: string;
  description?: string;
  control_type?: string;
  is_key?: boolean;
}

export interface TaxonomyFull extends TaxonomySummary {
  description?: string;
  risks_data: RiskItem[];
  controls_data: ControlItem[];
  schema: Record<string, unknown>;
}
