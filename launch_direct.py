import sys,runpy
sys.argv.append('--direct')
runpy.run_module('app',run_name='__main__')
