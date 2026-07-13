import { create } from "zustand";
type UIState={activeChallengeId?:string;syncStatus:"saved"|"syncing"|"offline";setActive:(id:string)=>void;setSync:(s:UIState["syncStatus"])=>void};
export const useUIStore=create<UIState>(set=>({syncStatus:"saved",setActive:id=>set({activeChallengeId:id}),setSync:syncStatus=>set({syncStatus})}));
