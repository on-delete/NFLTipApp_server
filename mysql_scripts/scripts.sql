create table user (
	user_id int not null auto_increment,
	user_name VARCHAR(100) not null unique,
	user_email VARCHAR(100) not null,
	user_password VARCHAR(100) not null,
	primary key(user_id)
);

create table teams (
	team_id int not null auto_increment,
	team_name varchar(100) not null unique,
	team_prefix varchar(10) not null unique,
	primary key(team_id)
);

insert into teams (team_name, team_prefix) VALUES 
('New England Patriots', 'NE'),
('Miami Dolphins', 'MIA'),
('Buffalo Bills', 'BUF'),
('New York Jets', 'NYJ'),
('Pittsburgh Steelers', 'PIT'),
('Baltimore Ravens', 'BAL'),
('Cincinnati Bengals', 'CIN'),
('Cleveland Browns', 'CLE'),
('Houston Texans', 'HOU'),
('Tennessee Titans', 'TEN'),
('Indianapolis Colts', 'IND'),
('Jacksonville Jaguars', 'JAX'),
('Oakland Raiders', 'OAK'),
('Kansas City Chiefs', 'KC'),
('Denver Broncos', 'DEN'),
('San Diego Chargers', 'SD'),
('Dallas Cowboys', 'DAL'),
('New York Giants', 'NYG'),
('Washington Redskins', 'WAS'),
('Philadelphia Eagles', 'PHI'),
('Green Bay Packers', 'GB'),
('Detroit Lions', 'DET'),
('Minnesota Vikings', 'MIN'),
('Chicago Bears', 'CHI'),
('Atlanta Falcons', 'ATL'),
('Tampa Bay Buccaneers', 'TB'),
('New Orleans Saints', 'NO'),
('Carolina Panthers', 'CAR'),
('Seattle Seahawks', 'SEA'),
('Arizona Cardinals', 'ARI'),
('Los Angeles Rams', 'LA'),
('San Francisco 49ers', 'SF');  

CREATE TABLE games (
	game_id int unique not null,
	game_datetime datetime not null,
	game_finished boolean not null,
	home_team_id int not null,
	home_team_score int,
	away_team_id int not null,
	away_team_score int,
	week int not null,
	season_type VARCHAR(5) not null,
	PRIMARY KEY (game_id),
	FOREIGN KEY (home_team_id) REFERENCES teams(team_id),
	FOREIGN KEY (away_team_id) REFERENCES teams(team_id)
);

create table predictions (
	prediction_id int not null auto_increment, 
	user_id int not null,
	game_id int not null,
	predicted boolean not null,
	home_team_predicted boolean,
	PRIMARY KEY (prediction_id),
	FOREIGN KEY (user_id) REFERENCES user(user_id),
	FOREIGN KEY (game_id) REFERENCES games(game_id)
);

create table standings (
	standing_id int not null,
	team_id int not null,
	prefix VARCHAR(2),
	games  VARCHAR(20) not null,
	score VARCHAR(10) not null,
	div_games VARCHAR(20) not null,
	PRIMARY KEY (standing_id),
	FOREIGN KEY (team_id) REFERENCES teams(team_id),
);

create table predictions_plus (
	predictions_p_id int not null auto_increment,
	user_id int not null,
	superbowl int,
	afc_winner int,
	nfc_winner int,
	best_offense int,
	best_defense int,
	PRIMARY KEY (predictions_p_id),
	FOREIGN KEY (user_id) REFERENCES user(user_id),
	FOREIGN KEY (superbowl) REFERENCES teams(team_id),
	FOREIGN KEY (afc_winner) REFERENCES teams(team_id),
	FOREIGN KEY (nfc_winner) REFERENCES teams(team_id),
	FOREIGN KEY (best_offense) REFERENCES teams(team_id),
	FOREIGN KEY (best_defense) REFERENCES teams(team_id),
);
