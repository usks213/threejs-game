/** World material IDs are shared by the SDF palette and collectible stacks.
 * Water and fire are transient element states, never implicit solid materials. */
export interface MaterialDefinition {
 id:number; name:string; durability:number; combustible:boolean; conductive:boolean; collectible:boolean;
}
const definition=(id:number,name:string,durability:number,combustible=false,conductive=false,collectible=true):MaterialDefinition=>({id,name,durability,combustible,conductive,collectible});
export const MATERIALS:Readonly<Record<number,MaterialDefinition>>={
 0:definition(0,'空気',0,false,false,false),
 1:definition(1,'地面',32),
 2:definition(2,'土',24),
 3:definition(3,'石',90),
 4:definition(4,'木材',45,true),
 5:definition(5,'角材',50,true),
 6:definition(6,'金属',120,false,true),
 7:definition(7,'草葉',12,true),
 8:definition(8,'祭壇石',100),
 9:definition(9,'松明の炎',0,false,false,false),
 10:definition(10,'布',18,true),
};
const body=definition(-1,'人体・装備',80,false,false,false);
export const materialDefinition=(id:number):MaterialDefinition=>MATERIALS[id]??body;
