import type { Ratings } from '../core/types';
export interface OfficialMode { name: string; blade_stats?: number[]; integrated_ratchet_bit_stats?: number[]; [key:string]: unknown }
export interface OfficialPart {
  id:string;category:string;name_ja:string;family:string;official_ratings:Ratings;
  source_urls:string[];source_image_urls:string[];rating_scope:string;verification:string;
  physical_parameters:null;display_name_ja?:string;component_names?:string[];component_types?:string[];
  modes?:OfficialMode[]|null;notes?:string|null;gimmick?:string;compatibility?:{cannot_attach?:string[];ratchet_requires?:string;[key:string]:unknown};
  official_rating_variants?:{ratings:Ratings;condition:string;source_image_url:string}[];
  [key:string]:unknown;
}
export interface OfficialProduct { product_key:string;name_ja:string;source_url:string;detail_image_urls?:string[];release_date:string|null;date_status:string;classes:string;[key:string]:unknown }
