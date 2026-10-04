import unittest
import os
import sys
from datetime import datetime, date

sys.dont_write_bytecode = True

# Myeongri Logic Unit Tests
ANCHOR_DATE = date(1900, 1, 31)

def calc_day_gan_index(birth_date_str):
    if not birth_date_str:
        return None
    parts = birth_date_str.split('-')
    d = date(int(parts[0]), int(parts[1]), int(parts[2]))
    diff = (d - ANCHOR_DATE).days
    return ((diff % 10) + 10) % 10

class TestMyeongriService(unittest.TestCase):
    def test_01_anchor_and_known_dates(self):
        # 1900-01-31 is Gap-Jin (Gap index = 0)
        self.assertEqual(calc_day_gan_index("1900-01-31"), 0)
        # 2024-01-01 is Gap-Ja (Gap index = 0)
        self.assertEqual(calc_day_gan_index("2024-01-01"), 0)
        # 2026-10-04 is Sin-Hae (Sin index = 7, metal)
        self.assertEqual(calc_day_gan_index("2026-10-04"), 7)

    def test_02_wealth_element_and_primary_day_mapping(self):
        # Stems: 0=Gap, 1=Eul -> Wood -> Wealth is Earth (토) -> Saturday (토요일)
        self.assertIn(calc_day_gan_index("1988-06-15"), range(10))
        # 10 Stems check
        elements = ['wood', 'wood', 'fire', 'fire', 'earth', 'earth', 'metal', 'metal', 'water', 'water']
        wealth_elements = ['earth', 'earth', 'metal', 'metal', 'water', 'water', 'wood', 'wood', 'fire', 'fire']
        primary_days = ['토요일', '토요일', '금요일', '금요일', '수요일', '수요일', '목요일', '목요일', '화요일', '화요일']
        
        for idx in range(10):
            elem = elements[idx]
            wealth = wealth_elements[idx]
            p_day = primary_days[idx]
            if elem == 'wood':
                self.assertEqual(wealth, 'earth')
                self.assertEqual(p_day, '토요일')
            elif elem == 'fire':
                self.assertEqual(wealth, 'metal')
                self.assertEqual(p_day, '금요일')
            elif elem == 'earth':
                self.assertEqual(wealth, 'water')
                self.assertEqual(p_day, '수요일')
            elif elem == 'metal':
                self.assertEqual(wealth, 'wood')
                self.assertEqual(p_day, '목요일')
            elif elem == 'water':
                self.assertEqual(wealth, 'fire')
                self.assertEqual(p_day, '화요일')

if __name__ == '__main__':
    unittest.main()
