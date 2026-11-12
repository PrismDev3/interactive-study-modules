"""Export the LEGO Marvel hub dance clips (63-joint minifig rig) to assets/anims/dances.json, same
retargetable format as export_minifig.py. Unpack the paks first with pak.py into <root>/<subdir>:
  hub_breakdance (BREAKDANCE_1), hub_dance1 (BREAKDANCE_2), hub_dance_walk, hub_cheer,
  stark (13intstarktower_set: PARKER_DANCE, DANCE_WIGGLE, PATRIOT_DANCE[_WALK]).
Usage: python -I export_dances.py <unpacked root> <out json> <rig glb>
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import export_minifig as em

em.CLIPS.clear()
em.CLIPS.update({
    'parker':     ('stark', 'PARKER_DANCE_DEF_nxg.an4', 0, True),
    'wiggle':     ('stark', 'DANCE_WIGGLE_DEF_nxg.an4', 0, True),
    'patriot':    ('stark', 'PATRIOT_DANCE_DEF_nxg.an4', 0, True),
    'dancewalk':  ('stark', 'PATRIOT_DANCE_WALK_DEF_nxg.an4', 0, True),
    'breakdance': ('hub_breakdance', 'BREAKDANCE_1_DEF_nxg.an4', 0, True),
    'breakdance2':('hub_dance1', 'BREAKDANCE_2_DEF_nxg.an4', 0, True),
    'hubwalk':    ('hub_dance_walk', 'DANCE_WALK_DEF_nxg.an4', 0, True),
    'cheer':      ('hub_cheer', 'CHEER_DEF_nxg.an4', 0, True),
})

if __name__ == '__main__':
    em.main(*sys.argv[1:4])
